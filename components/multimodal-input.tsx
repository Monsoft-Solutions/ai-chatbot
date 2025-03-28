'use client';

import type { Attachment, UIMessage } from 'ai';
import cx from 'classnames';
import type React from 'react';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';

import { ArrowUpIcon, PaperclipIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { useSearch } from '@/hooks/use-search';
import type { SearchOption } from './search-options';
import { ModelSelector } from '@/components/model-selector';
import { SearchOptionsSelector } from './search-options';

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
  selectedModelId
}: {
  chatId: string;
  input: UseChatHelpers['input'];
  setInput: UseChatHelpers['setInput'];
  status: UseChatHelpers['status'];
  stop: () => void;
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  append: UseChatHelpers['append'];
  handleSubmit: UseChatHelpers['handleSubmit'];
  className?: string;
  selectedModelId: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [searchOption] = useLocalStorage<SearchOption>('search-option', 'none');
  const searchStore = useSearch();

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight + 2, 98)}px`;
    }
  };

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '98px';
    }
  };

  const [localStorageInput, setLocalStorageInput] = useLocalStorage('input', '');

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || '';
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  const submitForm = useCallback(() => {
    window.history.replaceState({}, '', `/chat/${chatId}`);

    // If search option is enabled, configure the search state
    if (searchOption !== 'none' && input.trim()) {
      searchStore.resetSearch();
      searchStore.setSearchQuery(input);
      searchStore.setSearchStatus('starting');

      // Add search instruction based on the selected option
      const searchInstruction =
        searchOption === 'web-search'
          ? 'Search the web for current information on this topic.'
          : 'Perform a deep, thorough research on this topic with multiple sources.';

      const searchedInput = `${input}\n\n[AI Assistant should: ${searchInstruction}]`;

      handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>, {
        experimental_attachments: attachments,
        data: { searchOption }
      });
    } else {
      // Standard submission without search
      handleSubmit(undefined, {
        experimental_attachments: attachments
      });
    }

    setAttachments([]);
    setLocalStorageInput('');
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    attachments,
    handleSubmit,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    searchOption,
    input,
    searchStore
  ]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      console.log('Uploading file:', file.name, 'type:', file.type, 'size:', file.size);

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;
        console.log('File uploaded successfully:', url);

        return {
          url,
          name: pathname,
          contentType: contentType
        } as Attachment;
      }

      // Handle error responses
      const errorData = await response
        .json()
        .catch(() => ({ error: 'Failed to parse error response' }));
      const errorMessage =
        errorData.details || errorData.error || 'Unknown error occurred during upload';
      console.error('Upload error:', errorMessage);
      toast.error(errorMessage);
      return undefined;
    } catch (error) {
      console.error('Failed to upload file:', error);
      toast.error('Failed to upload file, please try again!');
      return undefined;
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) {
        console.log('No files selected');
        return;
      }

      console.log(
        'Selected files:',
        files.map((f) => `${f.name} (${f.type})`)
      );
      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment): attachment is Attachment => attachment !== undefined
        );

        console.log('Successfully uploaded attachments:', successfullyUploadedAttachments.length);

        if (successfullyUploadedAttachments.length === 0) {
          toast.error('No files were uploaded successfully');
        } else if (successfullyUploadedAttachments.length < files.length) {
          toast.warning(
            `${successfullyUploadedAttachments.length} of ${files.length} files uploaded successfully`
          );
        } else {
          toast.success('All files uploaded successfully');
        }

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments
        ]);
      } catch (error) {
        console.error('Error handling file uploads:', error);
        toast.error('Failed to process uploads. Please try again!');
      } finally {
        setUploadQueue([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [setAttachments]
  );

  return (
    <div className="relative flex w-full flex-col gap-4">
      {messages.length === 0 && attachments.length === 0 && uploadQueue.length === 0 && (
        <SuggestedActions append={append} chatId={chatId} />
      )}

      <input
        type="file"
        className="pointer-events-none fixed -left-4 -top-4 size-0.5 opacity-0"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div
          data-testid="attachments-preview"
          className="flex flex-row items-end gap-2 overflow-x-scroll"
        >
          {attachments.map((attachment) => (
            <PreviewAttachment key={attachment.url} attachment={attachment} />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{
                url: '',
                name: filename,
                contentType: ''
              }}
              isUploading={true}
            />
          ))}
        </div>
      )}

      <div className="relative">
        <Textarea
          data-testid="multimodal-input"
          ref={textareaRef}
          placeholder={
            searchOption !== 'none'
              ? `Send a message to search ${searchOption === 'web-search' ? 'the web' : 'with deep research'}...`
              : 'Send a message...'
          }
          value={input}
          onChange={handleInput}
          className={cx(
            'max-h-[calc(75dvh)] min-h-[98px] resize-none overflow-hidden rounded-xl bg-muted pb-12 pl-5 pr-32 pt-3 !text-base dark:border-zinc-700',
            className
          )}
          rows={3}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();

              if (status !== 'ready') {
                toast.error('Please wait for the model to finish its response!');
              } else {
                submitForm();
              }
            }
          }}
        />

        <div className="absolute bottom-3 left-3 flex items-center space-x-1">
          <AttachmentsButton
            className="size-8 rounded-full p-0 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            disabled={status !== 'ready'}
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }}
            iconSize={16}
          />

          <div className="flex items-center gap-1.5">
            <SearchOptionsSelector minimal={true} />
            <ModelSelector selectedModelId={selectedModelId} minimal={true} />
          </div>
        </div>
        <div className="absolute bottom-3 right-3 flex items-center space-x-1">
          {status === 'streaming' ? (
            <StopButton
              className="size-8 rounded-full bg-zinc-100 p-0 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              onClick={stop}
              iconSize={16}
            />
          ) : (
            <SendButton
              className={cx('size-8 rounded-full p-0', {
                'bg-primary text-black ': !searchOption || searchOption === 'none',
                'bg-green-600 text-black ': searchOption && searchOption !== 'none',
                'opacity-50': input.trim().length === 0 || status !== 'ready'
              })}
              disabled={input.trim().length === 0 || status !== 'ready'}
              searchEnabled={searchOption !== 'none'}
              onClick={submitForm}
              iconSize={16}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export const MultimodalInput = memo(PureMultimodalInput, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.selectedModelId !== nextProps.selectedModelId) return false;
  if (!equal(prevProps.attachments, nextProps.attachments)) return false;

  return true;
});

function PureAttachmentsButton({
  className,
  disabled,
  onClick,
  iconSize
}: {
  className?: string;
  disabled: boolean;
  onClick: () => void;
  iconSize: number;
}) {
  return (
    <Button
      className={className}
      disabled={disabled}
      onClick={onClick}
      variant="ghost"
      type="button"
    >
      <PaperclipIcon size={iconSize} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
  className,
  onClick,
  iconSize
}: {
  className?: string;
  onClick: () => void;
  iconSize: number;
}) {
  return (
    <Button className={className} onClick={onClick} variant="ghost" type="button">
      <StopIcon size={iconSize} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  className,
  disabled,
  searchEnabled,
  onClick,
  iconSize
}: {
  className?: string;
  disabled: boolean;
  searchEnabled?: boolean;
  onClick: () => void;
  iconSize: number;
}) {
  return (
    <Button
      className={className}
      disabled={disabled}
      onClick={onClick}
      variant="ghost"
      type="button"
    >
      <ArrowUpIcon size={iconSize} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.disabled !== nextProps.disabled) return false;
  if (prevProps.searchEnabled !== nextProps.searchEnabled) return false;
  if (prevProps.onClick !== nextProps.onClick) return false;
  return true;
});
