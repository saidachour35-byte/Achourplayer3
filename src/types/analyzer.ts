// Analyzer & upload modal type definitions
export interface AnalysisResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}
export type CodeFile = any;
