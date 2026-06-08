import type { SboxType } from "../types";
import type { ApiLoader } from "../api-loader";
import { sanitize, sanitizeDoc } from "../sanitizer";

export const MAX_NAME_LENGTH = 200;

export interface GetSboxTypeDeps {
  loader: ApiLoader | undefined;
}

export interface GetSboxTypeOptions {
  verbose?: boolean;
}

export interface GetSboxTypeResult {
  type?: SboxType;
  types?: SboxType[];
  note?: string;
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

export function getSboxType(
  deps: GetSboxTypeDeps,
  name: string,
  options?: GetSboxTypeOptions
): GetSboxTypeResult | undefined {
  if (name.includes("\0")) throw new Error("Name must not contain null bytes");
  if (name.length > MAX_NAME_LENGTH) throw new Error(`Name exceeds ${MAX_NAME_LENGTH} characters`);

  if (!deps.loader || !deps.loader.indexReady) return undefined;

  const shape = options?.verbose ? shapeVerbose : shapeNormal;

  const byFullName = deps.loader.getByFullName(name);
  if (byFullName) return { type: shape(byFullName) };

  const byName = deps.loader.getByName(name);
  if (byName.length === 0) return undefined;
  if (byName.length === 1) return { type: shape(byName[0]) };

  return {
    types: byName.map(shape),
    note: `Multiple types found: ${byName.map((t) => t.FullName).join(", ")}. Use the full name to get a specific type.`,
  };
}
