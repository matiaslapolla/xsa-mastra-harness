# Support Agent — Processor Architecture

How a customer message flows through `supportAgent` (`src/mastra/agents/support-agent.ts`): input pipeline → agentic loop → output pipeline, with the **tool loop** and **retry loop** highlighted.

```mermaid
flowchart TD
    User([Customer message]):::edge --> InputPipeline

    subgraph InputPipeline["Input pipeline"]
        direction TB
        UN["UnicodeNormalizer"]:::builtin
        PI["PromptInjectionDetector"]:::builtin
        PII_IN["PIIDetector · mask"]:::builtin
        MOD["ModerationProcessor · block"]:::builtin
        CG["CostGuardProcessor<br/>$2 / thread / 24h"]:::builtin
        UN --> PI --> PII_IN --> MOD --> CG
    end

    InputPipeline --> Memory[("LibSQL · last 20 msgs")]:::store
    Memory --> LLM

    subgraph AgentLoop["Agentic loop — maxSteps: 10"]
        direction TB
        LLM["groq/openai/gpt-oss-120b"]:::llm
        LLM --> OutputPipeline

        subgraph OutputPipeline["Output pipeline"]
            direction TB
            BPP["BatchPartsProcessor"]:::builtin
            PII_OUT["PIIDetector · placeholder"]:::builtin
            BVG["BrandVoiceGuardrail"]:::custom
            UPG["UnauthorizedPromiseGuardrail"]:::custom
            BPP --> PII_OUT --> BVG --> UPG
        end

        OutputPipeline --> Decision{finishReason?}
        Decision -->|tool-calls| ToolExec["escalateToHuman"]:::tool
        Decision -->|stop / length| Final
        ToolExec --> LLM
    end

    %% Retry loop
    BVG -.->|"retry · feedback ↩ model"| LLM
    UPG -.->|"retry · feedback ↩ model"| LLM

    %% Hard aborts
    CG -.->|abort| Tripwire[["Tripwire · blocked"]]:::abort
    MOD -.->|abort| Tripwire
    UPG -.->|"hard abort after retries"| Tripwire

    Final([Response to customer]):::edge

    classDef builtin fill:#1e3a5f,stroke:#4a90e2,stroke-width:1px,color:#fff
    classDef custom fill:#4a2c5a,stroke:#a67ec2,stroke-width:1px,color:#fff
    classDef llm fill:#2d5a2d,stroke:#7ac17a,stroke-width:2px,color:#fff
    classDef tool fill:#5a4a2c,stroke:#c2a67e,stroke-width:1px,color:#fff
    classDef store fill:#3a3a3a,stroke:#888,stroke-width:1px,color:#fff
    classDef abort fill:#5a2c2c,stroke:#c27e7e,stroke-width:2px,color:#fff
    classDef edge fill:#222,stroke:#fff,stroke-width:2px,color:#fff
```

## The two loops

**Tool loop** — `LLM → OutputPipeline → Decision (tool-calls) → escalateToHuman → LLM`. Pipelines run on every iteration.

**Retry loop** — `BrandVoiceGuardrail` and `UnauthorizedPromiseGuardrail` can call `abort(message, { retry: true })`, replaying the step with the correction appended to context. `retryCount` increments up to `maxProcessorRetries: 3`. Once exhausted, `UnauthorizedPromiseGuardrail` hard-aborts to Tripwire.

## Files

| Node | File |
| ---- | ---- |
| Agent | `src/mastra/agents/support-agent.ts` |
| BrandVoiceGuardrail | `src/mastra/processors/brand-voice-guardrail.ts` |
| UnauthorizedPromiseGuardrail | `src/mastra/processors/unauthorized-promise-guardrail.ts` |
| escalateToHuman | `src/mastra/tools/escalate-to-human.ts` |
