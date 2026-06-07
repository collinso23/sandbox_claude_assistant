import type { SboxType } from "../types";
import type { ApiLoader } from "../api-loader";
import { sanitize, sanitizeDoc } from "../sanitizer";

export const MAX_QUERY_LENGTH = 200;

export interface SearchApiDeps {
  loader: ApiLoader | undefined;
}

export interface SearchApiOptions {
  namespace?: string;
  verbose?: boolean;
}

function shapeNormal(type: SboxType): SboxType {
  return {
    Name: type.Name,
    FullName: type.FullName,
    Namespace: type.Namespace,
    Group: type.Group,
    Assembly: type.Assembly,
    IsPublic: type.IsPublic,
    DocId: type.DocId,
    IsAbstract: type.IsAbstract,
    BaseType: type.BaseType,
    Documentation: type.Documentation?.Summary
      ? { Summary: sanitize(type.Documentation.Summary) }
      : undefined,
    Methods: type.Methods?.map((m) => ({
      Name: m.Name,
      ReturnType: m.ReturnType,
      IsPublic: m.IsPublic,
      IsVirtual: m.IsVirtual,
      IsStatic: m.IsStatic,
      Parameters: m.Parameters,
      DocId: m.DocId,
    })),
    Properties: type.Properties?.map((p) => ({
      Name: p.Name,
      PropertyType: p.PropertyType,
      IsPublic: p.IsPublic,
      IsStatic: p.IsStatic,
      GetAccess: p.GetAccess,
      SetAccess: p.SetAccess,
      DocId: p.DocId,
    })),
    Fields: type.Fields?.map((f) => ({
      Name: f.Name,
      FieldType: f.FieldType,
      IsPublic: f.IsPublic,
      IsStatic: f.IsStatic,
      Value: f.Value,
    })),
    Constructors: type.Constructors?.map((c) => ({
      Parameters: c.Parameters,
      IsPublic: c.IsPublic,
      DocId: c.DocId,
    })),
  };
}

function shapeVerbose(type: SboxType): SboxType {
  return {
    ...type,
    Documentation: sanitizeDoc(type.Documentation),
    Methods: type.Methods?.map((m) => ({
      ...m,
      Documentation: sanitizeDoc(m.Documentation),
    })),
    Properties: type.Properties?.map((p) => ({
      ...p,
      Documentation: sanitizeDoc(p.Documentation),
    })),
    Fields: type.Fields?.map((f) => ({
      ...f,
      Documentation: sanitizeDoc(f.Documentation),
    })),
    Constructors: type.Constructors?.map((c) => ({
      ...c,
      Documentation: sanitizeDoc(c.Documentation),
    })),
  };
}

export function searchSboxApi(
  deps: SearchApiDeps,
  query: string,
  options?: SearchApiOptions
): SboxType[] {
  if (query.includes("\0")) throw new Error("Query must not contain null bytes");
  if (query.length > MAX_QUERY_LENGTH) throw new Error(`Query exceeds ${MAX_QUERY_LENGTH} characters`);

  if (!deps.loader || !deps.loader.indexReady) return [];

  const raw = deps.loader.search(query, options?.namespace);
  const shape = options?.verbose ? shapeVerbose : shapeNormal;
  return raw.map(shape);
}
