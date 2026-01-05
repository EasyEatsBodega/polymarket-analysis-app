/**
 * Type definitions for google-trends-api
 */

declare module 'google-trends-api' {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    property?: string;
    granularTimeResolution?: boolean;
  }

  interface RelatedQueriesOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface RelatedTopicsOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface InterestByRegionOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    resolution?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  export function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
  export function relatedQueries(options: RelatedQueriesOptions): Promise<string>;
  export function relatedTopics(options: RelatedTopicsOptions): Promise<string>;
  export function interestByRegion(options: InterestByRegionOptions): Promise<string>;
  export function dailyTrends(options: { geo?: string; trendDate?: Date; hl?: string }): Promise<string>;
  export function realTimeTrends(options: { geo?: string; hl?: string; category?: string }): Promise<string>;
}
