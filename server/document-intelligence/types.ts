export type DocumentUnitType = "page" | "slide" | "text";

export type ExtractedUnit = {
  type: DocumentUnitType;
  number: number;
  title?: string;
  text: string;
};

export type ExtractedDocument = {
  title?: string;
  units: ExtractedUnit[];
};

export type ImportFile = {
  name: string;
  bytes: Uint8Array;
};

export type SourceReference = {
  documentId: string;
  unitType: DocumentUnitType;
  unitNumber: number;
  chunkIndex: number;
};
