import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size should be less than 10MB'
    })
    .refine(
      (file) =>
        [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'text/plain',
          'text/csv',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/json'
        ].includes(file.type),
      {
        message:
          'Invalid file type. Supported types: JPEG, PNG, GIF, WEBP, PDF, TXT, CSV, DOCX, XLSX, JSON'
      }
    )
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors.map((error) => error.message).join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename from formData since Blob doesn't have name property
    const filename = (formData.get('file') as File).name;
    const fileBuffer = await file.arrayBuffer();

    try {
      const data = await put(`${filename}`, fileBuffer, {
        access: 'public'
      });

      return NextResponse.json(data);
    } catch (error) {
      console.error('Vercel Blob upload error:', error);
      // Check if BLOB_READ_WRITE_TOKEN is configured
      const isBlobTokenConfigured =
        process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN !== '****';

      if (!isBlobTokenConfigured) {
        return NextResponse.json(
          { error: 'Blob storage not configured. Please set BLOB_READ_WRITE_TOKEN in .env.local' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: 'Upload failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
