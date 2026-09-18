# Redocly 客户端 vs spacetraders-codegen: 优化机会分析

> 研究目标:对比 redocly 生成的参考客户端(`api-docs/SpaceTraders@2.1.0.client.ts`, v2.3.0)
> 与现有 IR 生成器(`spacetraders-codegen`),找出可回落到 codegen 的具体优化项。
> 结论先行:**codegen 的 client 层其实强于 redocly;差距集中在"类型保真度 + JSDoc + 错误易用性"。**

## 0. 一句话结论

| 维度 | redocly | codegen | 谁领先 |
| --- | --- | --- | --- |
| 请求层(auth / 限速 / 429 重试 / User-Agent) | 无(裸 fetch) | 限速 2qps、指数退避重试、token 优先级 | **codegen 领先** |
| 类型元数据 JSDoc(`@minLength`/`@format` 等) | 每个字段都带 | **完全丢** | **redocly 领先** |
| 枚举表示 | `type X = "A" | "B"` 联合 | `export enum X { VALUE_0 = "..." }` | redocly 更优 |
| 错误易用性 | `envelope:true` → `{data,headers,response}`、error-mode | 仅 `throw ApiError` | redocly 更优 |
| 函数体正确性 | 良好 | 存在**潜在**返回类型不匹配(被掩盖) | redocly 更优 |

**不要重写 client 层**——它是 codegen 的护城河。优化方向是"借 redocly 的类型/JSDoc/错误能力,不丢 codegen 的 client 能力"。

---

## 1. 已验证的具体问题

### P0-1 [高影响/低 effort] 类型元数据的 JSDoc 注解被丢掉
redocly 在每个字段/类型上保留 `@minLength`/`@maxLength`/`@format`,悬停即见:
```ts
/**
 * The symbol of the system.
 * @minLength 1
 */
export type SystemSymbol = string;   // ← 注意:redocly 也是裸 string,没做 branding
```
codegen 同一处(`renderGlobalType` 的 typeAlias 分支,`generateTypesFromIR.ts`):
```ts
export type SystemSymbol = string;   // ← @minLength 完全没了
```
**关键澄清**:两边都渲染成裸 `string`(都没 branding),所以差距**不是 branding,而是 JSDoc 注解**。而 IR 里这些数据**本来就存在**——`IrField2 extends IrFieldConstraints` 有 `minLength/maxLength/minimum/maximum/pattern/format`。`renderField` 已会写 `field.description`,只差把约束也写成 JSDoc。

→ 改 `renderGlobalType`/`renderField`:把约束渲染成 `@minLength N`/`@maxLength N`/`@minimum N`/`@format date-time` 等 JSDoc。

### P0-2 [高影响/低 effort] 全局接口字段的约束注解也没写
`Agent.credits` 在 redocly 里带 `@format int64`;codegen 只有 `credits: number`。同上,IR 有数据,只是没渲染。

### P1-1 [中影响/低 effort] 枚举用 TS enum + `VALUE_n`,而非字面量联合
codegen(`renderEnum`,`generateTypesFromIR.ts`):
```ts
export enum SystemType {
  VALUE_0 = "NEUTRON_STAR",
  VALUE_1 = "RED_STAR",
}
```
redocly:
```ts
export type FactionSymbol = "COSMIC" | "VOID" | "GALACTIC" | ... ;
export const FactionSymbol = { COSMIC: "COSMIC", ... } as const;
```
字面量联合对**穷举检查 / 悬停 / 无运行时开销**更友好;`VALUE_0` 这种自动名可读性差。建议改为联合类型(保留可选的 const 对象以支持运行时遍历)。

### P1-2 [低影响/低 effort] 缩进不一致  ✅ 已修复(2026-08)
**根因**(实证,非目测):三处模板字面量各多塞 2 格。
- `renderField` 单行分支 `` `  ${comment}  ${field.name}` ``:`${comment}` 前带 2 格,当 `comment=""` 时合并成 4 格。
- `renderField` 多行分支 `` `    /**\n...\n    */\n  ${field.name}` ``:`/**`/`*/` 在 4 格。
- `generateApiCallCode`:`req` 按 0 基线组装时 `path`/`params`/`query`/`body` 用 4 格、嵌套 6 格、闭合 2 格,被 `generateFunctionContent` +2 后全多 2 格。
**修复**(纯模板字面量,不改 IR,三处各 -2 / 统一基线):
- `generateFunctionsFromIR.ts` `generateApiCallCode`:`path`/`params`/`query`/`body` 成员 4→2、嵌套 6→4、各闭合 4→2 / 2→0。
- `renderIr.ts` `renderField`:单行分支去掉 `${comment}` 前 2 格;多行分支 `/**`/`*/` 4→2、` *` 3。
**验证**:`npm run build` 0 / `npm run generate`(59) 0 / `tsc --strict`(tsconfig.check.json) 0 / jest 21-21 0;
生成产物:`return response.data;` = 59、裸 `return response;` = 0;apiCall 成员 4(函数体内)/嵌套 6/`});` 2;本地接口字段 2 格;types.ts 约束块 `/**`/`*/` 2、` *` 3、字段名 2。三处字段名现已统一落位 2 格。

### P2-1 [低影响/但属真实潜在 bug] 返回类型不匹配(当前被掩盖)
`generateFunctionBody`:签名是 `Promise<T>`(数据),但 `validate=false 且无 postProcessing` 分支会 `return response`(整个 `ApiResponse<T>`)。
**现状**:每个函数 IR 都带 `postProcessing.type=simple`(`dataField=data`),所以都走 `return response.data`,该分支目前是死代码。一旦有函数不带 postProcessing,就会类型不符。建议:让默认分支也返回 `response.data`(或让签名改为 `Promise<ApiResponse<T>>`)。

**postProcessing 是否过度设计——OpenAPI 3.0.1 规范实证(2026 补充)**:

- 规范对"一个响应"的完整定义(Response Object)只有 `description` / `headers` / `content` / `links` 四字段。`content[application/json].schema` **直接描述 payload**;规范**没有 envelope 约定、没有 unwrapping、没有 response transformation 概念**。`encoding` 对象只作用于 requestBody(multipart / form-urlencoded),与响应无关。即:`{ data, meta }` 信封不是 OpenAPI 特性,是 SpaceTraders 应用惯例,用一个普通响应 schema 表达。
- codegen 的 postProcessing 因此**不是规范功能,是 codegen 自创**:它唯一真正必需的工作是"从客户端 `ApiResponse` 壳取出 payload 以匹配 `Promise<T>`"(SpaceTraders 信封由客户端 `send()` 在运行时解包)。该操作所有端点一致 → `simple` 不过度;但它是客户端约定层步骤,不是规范层功能。
- `transform`/`custom` 在提取 payload 后再变换它,规范既无 envelope 也无变换概念 → 纯推测、无依据。
- 注意一个易错点(已核实):spec 里 `links` 出现 2 次、`example` 出现 4 次,但**归属都不是响应后资产**:
  - `links`:唯一一处是 `GET /` 响应 schema 的 `links` **字段** `{ links: [{name,url}] }` —— SpaceTraders 应用数据(超链接),**不是** OpenAPI Response Object 的 `links`(`operationRef/operationId` 操作链)。真正 OpenAPI 导航 link = **0**。
  - `example`:4 处全是**请求侧** schema 的内联 `example`(`POST /register` 的 `symbol`="BADGER"、`GET /factions/{factionSymbol}` 路径参数="COSMIC"、`POST /refuel` 的 `units`=100、`fromCargo`=false)。**响应侧 example = 0**。
- **判定①(响应后处理)**:此 spec 响应侧无 links/examples/信封 → postProcessing 收敛为单一语义 `simple`(提取 payload)是**正确且彻底**的,没有"更富的响应后模型"可转向。`simple` 应保留。
- **判定②(输入文档,已评估后放弃)**:4 个请求侧 `example`(`BADGER`/`COSMIC`/`100`/`false`)理论上能给参数补取值示例。但①`@example` 约定是代码片段、给参数挂标量是语义错用;②与类型+约束注解高度冗余(enum 联合类型已列全值、format/length 已给边界);③还要把参数重构成多行块。**结论:不做。** 若真要提升 hint,正解是函数级 usage `@example` 代码片段,但那是另一个更大 feature,非顺手可做。

---

## 2. 未做但值得记录的差距(非本次优先)

- **无 envelope / 判别式错误**:redocly 支持 `envelope:true` → `{data, headers, response}`,以及 `errorMode`。codegen 只 `throw ApiError`,调用方拿不到原始 envelope。属于 DX 增强,可后续加。
- **无能力开关**:redocly 挂了 paginate/timeout/stream 等 capability 钩子。codegen 的 client 已有限速/重试,能力更实用;分页等"复合动作"按 DRAFT.md 的"手写"约定,本就不该生成。
- **`is_valid()` 只覆盖局部响应类型(kind=class)**:全局模型类型(interface)无运行时校验。对输入参数校验是否要补,是设计取舍,非 bug。

---

## ✅ 已完成(P0-1 / P0-2 / P1-1)

已落地并验证(改动集中在 `src/renderIr.ts` 与 `src/generateTypesFromIR.ts`,不碰 client 层):

- **P0-1**: `renderGlobalType` 的 typeAlias 分支现在用 `renderSchemaJSDoc` 把原始 schema 的 `description` + `@minLength/@maxLength/@minimum/@maximum/@pattern/@format` 渲染成 JSDoc。例:
  ```ts
  /**
   * The symbol of the system.
   * @minLength 1
   */
  export type SystemSymbol = string;
  ```
- **P0-2**: `renderField` 对带约束的字段输出多行 JSDoc(沿用现有 4 空格 `/**` 基线)。例:
  ```ts
    /**
     * Symbol of the agent.
     * @minLength 3
     * @maxLength 14
    */
  symbol: string;
  ```
  无约束字段(含无描述字段)输出**零改动**。
- **P1-1**: `renderEnum` 改为 `export type X = "A" | "B"` 字面量联合 + `export const X = { A: "A", ... } as const`(键由枚举值派生,因 `VALUE_n` 无意义)。
- **P2-1 + postProcessing 收口 (B)**: 删除返回类型不匹配的死分支,并把 `IrDataProcessor` 从三态多态(simple/transform/custom)收敛为单一语义。
  - `generateFunctionsFromIR.ts`:`generateFunctionBody` 不再 `if/else`(删 P2-1 的 `return response;` 死分支),无条件 `generatePostProcessingCode(...)`;`generatePostProcessingCode` 砍掉 transform/custom,只 `return response.${dataField};`。
  - `generateIrFunction.ts`:`IrDataProcessor` 收敛为 `{ dataField: string }`(删 `type`/`transformFunction`/`customCode`);构造改为 `{ dataField: "data" }`。
  - 依据:OpenAPI 3.0.1 规范无 envelope/解包/变换概念(见 P2-1 节实证)。SpaceTraders 所有响应统一为"解包 `data`",无 transform/custom 用例。

验证:`npm run build` 通过、`npx jest` 21/21 通过、生成产物(`types.ts` + 59 函数)经 `tsc --strict` 零错误。全量确认:59 函数全部 `return response.data;`,裸 `return response;` 为 0。

## 3. 建议的落地顺序

| 优先级 | 项 | 改动文件 | 影响/effort |
| --- | --- | --- | --- |
| 1 | P0-1/P0-2:约束渲染为 JSDoc | `renderIr.ts` 的 `renderField` + `generateTypesFromIR.ts` 的 `renderGlobalType` | 高/低 |
| 2 | P1-1:枚举改字面量联合 | `generateTypesFromIR.ts` 的 `renderEnum` | 中/低 |
| 3 | P1-2:统一缩进 | `renderField`/`renderLocalType`/`generateApiCallCode` | 低/低 |
| 4 | ✅ P2-1:返回类型一致性 + postProcessing 收口 | `generateFunctionsFromIR.ts` 的 `generateFunctionBody`/`generatePostProcessingCode`、`generateIrFunction.ts` 的 `IrDataProcessor` | 低/低 |
| 5 | (后续) envelope/判别式错误 | 新增 client 能力或 IR 字段 | 中/中 |

> 全部 P0/P1 改动都是"把 IR 里已有的数据渲染出来 + 格式对齐",**不新增 IR 结构、不碰 client 层**,风险极低,可一次性合入后重跑 `generateIrFunction.test.ts`。
