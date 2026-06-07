import type { SboxDocumentation } from "./types";

const MAX_DOC_LENGTH = 2000;

const ZERO_WIDTH = /[​-‍﻿­⁠]/g;

const INJECTION_PATTERNS: RegExp[] = [
  // Instruction overrides
  /ignore\s+(all\s+|previous\s+|prior\s+|your\s+)*(instructions?|prompts?|context|guidelines?)/gi,
  /disregard\s+(all\s+|previous\s+|prior\s+|your\s+)*(instructions?|safety|guidelines?|rules?|system\s+prompt)/gi,
  /forget\s+(everything|all)\s+(above|prior|previous)/gi,
  /override\s+(all\s+|previous\s+|prior\s+)*instructions?/gi,
  /your\s+new\s+(instructions?|persona|role|task)\s+(is|are)/gi,
  /from\s+now\s+on\s+you\s+(are|will|must)/gi,

  // Persona hijacking
  /act\s+as\s+(if\s+you\s+(are|were)|a\s+(?:different|unrestricted|evil|malicious|jailbroken))/gi,
  /pretend\s+(you\s+are|to\s+be)/gi,
  /you\s+are\s+now\s+(in\s+)?(developer|admin|unrestricted|jailbreak|DAN|stan)\s*mode/gi,
  /\bjailbreak\b/gi,
  /\bDAN\s+mode\b/gi,

  // System prompt markers
  /\bSYSTEM\s*:/gi,
  /<\s*SYSTEM\s*>[\s\S]*?<\/SYSTEM\s*>/gi,
  /###\s*(instruction|system|context|prompt)/gi,
  /---\s*(system|instruction)/gi,

  // LLM delimiter blocks
  /\[INST\][\s\S]*?\[\/INST\]/gi,
  /<<SYS>>[\s\S]*?<<\/SYS>>/gi,
  /<\|[^|]*\|>/g,

  // Refusal override
  /do\s+not\s+refuse\s+this\s+request/gi,

  // Exfiltration
  /(send|forward|post|transmit|exfiltrate)\s.{0,60}\s+to\s+(https?:\/\/|[\w.]+@)/gi,
  /(fetch|curl|wget|http\.get)\s*[([]/gi,
];

const REDACTION = "[sanitized]";

export function sanitize(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  if (text === "") return "";

  let result = text.normalize("NFKC").replace(ZERO_WIDTH, "");

  if (result.length > MAX_DOC_LENGTH) {
    result = result.slice(0, MAX_DOC_LENGTH);
  }

  for (const pattern of INJECTION_PATTERNS) {
    result = result.replace(pattern, REDACTION);
  }

  return result;
}

export function sanitizeDoc(
  doc: SboxDocumentation | undefined
): SboxDocumentation | undefined {
  if (doc === undefined) return undefined;
  return {
    Summary: sanitize(doc.Summary),
    Remarks: sanitize(doc.Remarks),
  };
}
