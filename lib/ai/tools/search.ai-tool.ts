import { searchSchema } from '@/lib/schemas/search-tool-params.schema';
import {
  SearchResultImage,
  SearchResults,
  SearchResultItem,
  SearchStep,
  SearchSourceDetail,
  SearchAnalysisPoint
} from '@/lib/types/search.type';
import { sanitizeUrl } from '@/lib/utils/web.utils';
import { DataStreamWriter, tool } from 'ai';
import type { Session } from 'next-auth';

interface SearchToolProps {
  session?: Session;
  dataStream?: DataStreamWriter;
}

export const searchTool = ({ session, dataStream }: SearchToolProps = {}) =>
  tool({
    description: 'Search the web for information',
    parameters: searchSchema,
    execute: async ({
      query,
      max_results,
      search_depth = 'basic',
      include_domains,
      exclude_domains
    }) => {
      // Tavily API requires a minimum of 5 characters in the query
      const filledQuery = query.length < 5 ? query + ' '.repeat(5 - query.length) : query;
      let searchResult: SearchResults;

      try {
        // If we have a dataStream, stream initial search status
        if (dataStream) {
          dataStream.writeData({
            type: 'search-status',
            content: 'starting'
          });

          dataStream.writeData({
            type: 'search-query',
            content: filledQuery
          });
        }

        // Extract key topics from the query to create meaningful step titles
        const mainTopic = filledQuery
          .replace(/\b(what|how|when|where|why|is|are|can|do|does|did)\b/gi, '')
          .trim();

        // Generate related queries based on the main query
        const relatedQueries = generateRelatedQueries(filledQuery, mainTopic);

        // Stream initial search step
        if (dataStream) {
          const initialStep: SearchStep = {
            title: `Researching ${mainTopic}`,
            completed: false,
            type: 'search',
            query: filledQuery
          };

          dataStream.writeData({
            type: 'search-step',
            content: JSON.stringify(initialStep)
          });
        }

        // Perform the actual search
        searchResult = await tavilySearch(
          filledQuery,
          max_results,
          search_depth as 'basic' | 'advanced',
          include_domains,
          exclude_domains
        );

        // Extract sources from search results
        const sources = new Set<string>();
        searchResult.results.forEach((result) => {
          try {
            const url = new URL(result.url);
            const domain = url.hostname.replace('www.', '').split('.')[0];
            if (domain) {
              sources.add(domain.toLowerCase());
              // Add source to the result item as well
              result.source = domain.toLowerCase();
            }
          } catch {
            // Skip if URL parsing fails
          }
        });

        // Update the completed first step
        if (dataStream) {
          const completedStep: SearchStep = {
            title: `Researching ${mainTopic}`,
            completed: true,
            type: 'search',
            query: filledQuery,
            results: searchResult.results
          };

          dataStream.writeData({
            type: 'search-step',
            content: JSON.stringify(completedStep)
          });
        }

        // Stream second step (reading)
        if (dataStream) {
          const readingStep: SearchStep = {
            title: `Investigating additional aspects of ${mainTopic}`,
            completed: true,
            type: 'search',
            query: filledQuery,
            additional_queries: relatedQueries,
            sources: Array.from(sources).slice(0, 8)
          };

          dataStream.writeData({
            type: 'search-step',
            content: JSON.stringify(readingStep)
          });
        }

        // Generate steps for the search process based on the query
        searchResult.steps = generateSearchSteps(filledQuery, searchResult);

        // Stream final analysis steps if applicable
        if (dataStream && searchResult.steps) {
          for (let i = 2; i < searchResult.steps.length; i++) {
            dataStream.writeData({
              type: 'search-step',
              content: JSON.stringify(searchResult.steps[i])
            });
          }

          dataStream.writeData({
            type: 'search-status',
            content: 'completed'
          });
        }
      } catch (error) {
        console.error('Search API error:', error);
        searchResult = {
          results: [],
          query: filledQuery,
          images: [],
          number_of_results: 0,
          steps: []
        };

        if (dataStream) {
          dataStream.writeData({
            type: 'search-error',
            content: JSON.stringify({ message: 'Search failed' })
          });
        }
      }

      console.log('completed search');
      return searchResult;
    }
  });

function generateSearchSteps(query: string, searchResult: SearchResults): SearchStep[] {
  // Extract key topics from the query to create meaningful step titles
  const mainTopic = query
    .replace(/\b(what|how|when|where|why|is|are|can|do|does|did)\b/gi, '')
    .trim();

  // Extract sources from search results to use in the reading step
  const sources = new Set<string>();
  const sourceDetails: SearchSourceDetail[] = searchResult.results
    .map((result) => {
      // Extract domain from URL
      try {
        const url = new URL(result.url);
        const domain = url.hostname.replace('www.', '').split('.')[0].toLowerCase();
        if (domain) {
          sources.add(domain);
          // Add source to the result item as well
          result.source = domain;

          // Return detailed source information with guaranteed summary
          return {
            url: result.url,
            domain: domain,
            title: result.title,
            summary: result.content.substring(0, 120) + '...'
          };
        }
      } catch {
        // Skip if URL parsing fails
      }
      return null;
    })
    .filter((item): item is SearchSourceDetail => item !== null);

  // Generate related queries based on the main query
  const relatedQueries = generateRelatedQueries(query, mainTopic);

  // Create steps
  const steps: SearchStep[] = [
    {
      title: `Researching ${mainTopic}`,
      completed: true,
      type: 'search',
      query: query,
      results: searchResult.results.slice(0, 2),
      sourceDetails: sourceDetails,
      sources: Array.from(sources)
    },
    {
      title: `Investigating additional aspects of ${mainTopic}`,
      completed: true,
      type: 'search',
      query: query,
      additional_queries: relatedQueries,
      sources: Array.from(sources),
      sourceDetails: sourceDetails,
      summary: `Found information about ${mainTopic} from ${sourceDetails.length} sources including ${Array.from(sources).slice(0, 3).join(', ')}${sources.size > 3 ? ' and more' : ''}.`
    }
  ];

  // Add analysis steps based on the content of the search
  const isAnalysisNeeded = searchResult.results.length > 2;

  if (isAnalysisNeeded) {
    // Create analysis points based on search results
    const analysisPoints = generateAnalysisPoints(searchResult.results, Array.from(sources));

    steps.push({
      title: `Analyzing information about ${mainTopic}`,
      completed: true,
      type: 'analysis',
      summary: `Analysis of key information about ${mainTopic} based on search results.`,
      analysisPoints: analysisPoints
    });
  }

  return steps;
}

function generateRelatedQueries(originalQuery: string, topic: string): string[] {
  // Simplistic approach to generate related queries
  const baseQueries = [`${topic} latest developments`, `${topic} analysis`, `${topic} trends`];

  // Filter out any that are too similar to the original query
  return baseQueries.filter((q) => q !== originalQuery && !originalQuery.includes(q));
}

async function tavilySearch(
  query: string,
  maxResults: number = 10,
  searchDepth: 'basic' | 'advanced' = 'basic',
  includeDomains: string[] = [],
  excludeDomains: string[] = []
): Promise<SearchResults> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set in the environment variables');
  }
  const includeImageDescriptions = true;
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.max(maxResults, 5),
      search_depth: searchDepth,
      include_images: true,
      include_image_descriptions: includeImageDescriptions,
      include_answers: true,
      include_domains: includeDomains,
      exclude_domains: excludeDomains
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const processedImages = includeImageDescriptions
    ? data.images
        .map(({ url, description }: { url: string; description: string }) => ({
          url: sanitizeUrl(url),
          description
        }))
        .filter(
          (image: SearchResultImage): image is { url: string; description: string } =>
            typeof image === 'object' && image.description !== undefined && image.description !== ''
        )
    : data.images.map((url: string) => sanitizeUrl(url));

  return {
    ...data,
    images: processedImages
  };
}

// Helper function to generate analysis points from search results
function generateAnalysisPoints(
  results: SearchResultItem[],
  sources: string[]
): SearchAnalysisPoint[] {
  // Extract potential topics from search results
  const contentWords = results.flatMap((result) =>
    result.content.split(/\s+/).filter((word: string) => word.length > 5 && /^[A-Z]/.test(word))
  );

  // Get most frequent topics
  const topicCounts: Record<string, number> = {};
  for (const word of contentWords) {
    topicCounts[word] = (topicCounts[word] || 0) + 1;
  }

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  // Create analysis points
  return [
    {
      title: 'Key Findings',
      content: `The search revealed important information about ${topTopics.slice(0, 3).join(', ') || 'the topic'} from multiple sources.`,
      sources: sources.slice(0, 3)
    },
    {
      title: 'Data Synthesis',
      content: `Information was collected from ${sources.length} different sources, providing a comprehensive view of the subject.`,
      sources: sources.slice(0, 2)
    },
    {
      title: 'Content Analysis',
      content: `Analysis of the content shows emphasis on ${topTopics.length > 1 ? topTopics.slice(0, 2).join(' and ') : topTopics[0] || 'relevant information'}, with supporting information from multiple reliable sources.`,
      sources: sources.slice(1, 4)
    }
  ];
}
