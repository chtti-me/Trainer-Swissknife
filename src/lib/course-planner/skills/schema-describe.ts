import { z } from "zod";

/**
 * 把 Zod schema 轉成人類可讀的 TypeScript-like 介面文字，給 LLM 看用。
 * 比 zod-to-json-schema 更精簡：保留型別 + description（中文標註）+ 必填／選填，
 * 而非完整 JSON Schema 那一大坨 metadata。
 *
 * 設計目標：讓 Gemini / OpenAI 在 prompt 內清楚看到要產出哪些欄位、漏寫率大幅下降。
 *
 * 範例輸出：
 * ```
 * {
 *   needsSummary: string  // 一句話摘要：誰、要學什麼、要解決什麼問題
 *   capabilityGaps: Array<{
 *     gap: string  // 具體能力差距描述
 *     whoLacks: string  // 哪一群人欠缺
 *     evidenceFromInput: string  // 從原始需求中支持此判斷的線索
 *   }>  // 至少 1 個元素
 *   isTrainingProblem: boolean  // 這個問題是不是培訓真的能解？
 *   nonTrainingAdvice?: string  // 若 isTrainingProblem=false，建議該做什麼非培訓行動
 *   reasoning: string  // 1~3 句話說明你為什麼這樣判斷／設計
 *   confidence: number(0~1)  // 自評信心度 0.0 ~ 1.0
 * }
 * ```
 */
export function describeZodSchema(schema: z.ZodTypeAny, indent = 0): string {
  return describe(schema, indent);
}

const PAD = (n: number) => "  ".repeat(n);

function describe(schema: z.ZodTypeAny, indent: number): string {
  const desc = schema.description;
  const inner = describeInner(schema, indent);
  return desc ? `${inner}  // ${desc}` : inner;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeInner(schema: z.ZodTypeAny, indent: number): string {
  // unwrap optional / nullable / default 但保留標記
  if (schema instanceof z.ZodOptional) {
    return `${describeInner(schema.unwrap(), indent)} | undefined`;
  }
  if (schema instanceof z.ZodNullable) {
    return `${describeInner(schema.unwrap(), indent)} | null`;
  }
  if (schema instanceof z.ZodDefault) {
    return describeInner(schema._def.innerType, indent);
  }
  if (schema instanceof z.ZodEffects) {
    return describeInner(schema._def.schema, indent);
  }

  if (schema instanceof z.ZodString) {
    const checks = (schema._def.checks ?? [])
      .map((c) => {
        if (c.kind === "min") return `min ${c.value}`;
        if (c.kind === "max") return `max ${c.value}`;
        if (c.kind === "email") return "email";
        if (c.kind === "url") return "url";
        return "";
      })
      .filter(Boolean);
    return checks.length ? `string(${checks.join(", ")})` : "string";
  }

  if (schema instanceof z.ZodNumber) {
    const checks = (schema._def.checks ?? [])
      .map((c) => {
        if (c.kind === "min") return `>= ${c.value}`;
        if (c.kind === "max") return `<= ${c.value}`;
        if (c.kind === "int") return "整數";
        return "";
      })
      .filter(Boolean);
    return checks.length ? `number(${checks.join(", ")})` : "number";
  }

  if (schema instanceof z.ZodBoolean) return "boolean";

  if (schema instanceof z.ZodEnum) {
    const opts = (schema._def.values as string[]).map((v) => JSON.stringify(v)).join(" | ");
    return opts;
  }

  if (schema instanceof z.ZodNativeEnum) {
    const values = Object.values(schema._def.values as Record<string, string | number>);
    return values.map((v) => JSON.stringify(v)).join(" | ");
  }

  if (schema instanceof z.ZodLiteral) {
    return JSON.stringify(schema._def.value);
  }

  if (schema instanceof z.ZodUnion) {
    const opts = (schema._def.options as z.ZodTypeAny[])
      .map((s) => describeInner(s, indent))
      .join(" | ");
    return opts;
  }

  if (schema instanceof z.ZodArray) {
    const item = describeInner(schema._def.type as z.ZodTypeAny, indent);
    const minRule = schema._def.minLength?.value;
    const maxRule = schema._def.maxLength?.value;
    const constraints: string[] = [];
    if (minRule != null) constraints.push(`至少 ${minRule} 個元素`);
    if (maxRule != null) constraints.push(`最多 ${maxRule} 個元素`);
    const note = constraints.length ? `  // ${constraints.join("、")}` : "";
    return `Array<${item}>${note}`;
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape() as Record<string, z.ZodTypeAny>;
    const lines: string[] = ["{"];
    for (const [key, value] of Object.entries(shape)) {
      const isOptional =
        value instanceof z.ZodOptional ||
        value instanceof z.ZodDefault ||
        (value instanceof z.ZodNullable && value._def.innerType instanceof z.ZodOptional);
      const innerSchema =
        value instanceof z.ZodOptional || value instanceof z.ZodDefault
          ? value instanceof z.ZodOptional
            ? value.unwrap()
            : (value._def.innerType as z.ZodTypeAny)
          : value;
      const typeText = describeInner(innerSchema, indent + 1);
      const fieldDesc = innerSchema.description ?? value.description;
      const comment = fieldDesc ? `  // ${fieldDesc}` : "";
      lines.push(`${PAD(indent + 1)}${key}${isOptional ? "?" : ""}: ${typeText}${comment}`);
    }
    lines.push(`${PAD(indent)}}`);
    return lines.join("\n");
  }

  if (schema instanceof z.ZodRecord) {
    return `Record<string, ${describeInner(schema._def.valueType as z.ZodTypeAny, indent)}>`;
  }

  return "unknown";
}
