import { CanvasDocument, emptyCanvasDocument } from './model';

export interface CanvasTemplate {
  id: string;
  name: string;
  description: string;
  category: 'physics' | 'chemistry' | 'math' | 'biology';
  document: CanvasDocument;
}

export const CANVAS_TEMPLATES: CanvasTemplate[] = [];