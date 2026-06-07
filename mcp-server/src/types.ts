export interface SboxDocumentation {
  Summary?: string;
  Remarks?: string;
}

export interface SboxParameter {
  Name: string;
  Type: string;
}

export interface SboxMethod {
  Name: string;
  ReturnType: string;
  IsPublic: boolean;
  IsVirtual: boolean;
  IsStatic: boolean;
  Parameters: SboxParameter[];
  Documentation?: SboxDocumentation;
  DocId: string;
}

export interface SboxProperty {
  Name: string;
  PropertyType: string;
  IsPublic: boolean;
  IsStatic: boolean;
  GetAccess: string;
  SetAccess: string;
  Documentation?: SboxDocumentation;
  DocId: string;
}

export interface SboxField {
  Name: string;
  FieldType: string;
  IsPublic: boolean;
  IsStatic: boolean;
  Value?: string;
  Documentation?: SboxDocumentation;
}

export interface SboxConstructor {
  Parameters: SboxParameter[];
  IsPublic: boolean;
  Documentation?: SboxDocumentation;
  DocId: string;
}

export interface SboxType {
  Name: string;
  FullName: string;
  Namespace: string;
  Group: "class" | "interface" | "enum" | "struct";
  Assembly: string;
  IsPublic: boolean;
  IsAbstract?: boolean;
  BaseType?: string;
  Documentation?: SboxDocumentation;
  Methods?: SboxMethod[];
  Properties?: SboxProperty[];
  Fields?: SboxField[];
  Constructors?: SboxConstructor[];
  DocId: string;
}

export interface ApiRoot {
  Types: SboxType[];
}

export interface Gotcha {
  id: string;
  title: string;
  tags: string[];
  wrongPattern: string;
  wrongReason: string;
  fix: string;
  fixReason: string;
  apiTypes?: string[];
  confirmedVersion: string;
  lastVerified: string;
  confirmedBy: string;
  confidence: "single-source" | "multi-source" | "verified";
  source: "platform" | "project";
}
