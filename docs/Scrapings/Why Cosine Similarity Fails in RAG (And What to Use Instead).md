---
title: Why Cosine Similarity Fails in RAG (And What to Use Instead)
source: https://dev.to/mossforge/why-cosine-similarity-fails-in-rag-and-what-to-use-instead-pb5
author:
  - "[[Jon]]"
published: 2026-01-29
seen: 2026-08-02T20:16:42+02:00
description: Cosine similarity measures proximity, not usefulness. Learn why your RAG system hallucinates despite "relevant" chunks, and how to fix it with semantic stress (ΔS). Tagged with rag, llm, embeddings, ai.
tags:
  - RAG
Status: rejected
---
You've built a RAG system. Your retriever returns chunks with 0.85 cosine similarity. Your LLM still hallucinates.

Sound familiar?

I've spent months debugging this exact problem across production RAG systems. The issue isn't your embedding model or your chunking strategy. It's that **cosine similarity measures the wrong thing**.

## The Problem: "Relevant" ≠ "Useful"

Here's a real example that broke in production:

```
User Query: "How do I cancel my free trial?"

Top Retrieved Chunk (cosine: 0.78):
"Subscriptions renew monthly or yearly, depending on your plan."

LLM Output:
"You can cancel by not renewing at the end of your billing cycle."
```

This is **completely wrong**. The chunk mentions subscriptions and renewal, so it scores high on cosine similarity. But it doesn't actually explain how to cancel a trial.

### Why Cosine Similarity Misleads

Cosine similarity measures **vector proximity in embedding space**. It's optimized to capture:

- Keyword overlap
- Phrasing similarity
- Topic relatedness

What it **doesn't** measure:

- Whether the chunk can answer the question
- Logical usefulness for the specific query
- Semantic fitness for the user's intent

Think about it: both "cancel free trial" and "subscription renewal" contain similar vocabulary. Embedding models learn that these concepts are related. So they end up close in vector space.

But **topic similarity ≠ answer capability**.

## The Fix: Semantic Stress (ΔS)

Instead of measuring proximity, we need to measure **semantic fitness** - how well a chunk actually serves the question's intent.

Enter **Semantic Stress (ΔS)**:

```
ΔS = 1 − cos(I, G)

Where:
  I = question embedding (Intent)
  G = chunk embedding (Grounding)
```

### "Wait, Isn't That Just 1 Minus Cosine?"

Mathematically, yes. But the key difference is **what you do with it**.

Traditional RAG uses cosine to **rank** chunks:

```
# Standard approach
chunks = retriever.search(query, k=10)  # Returns top-10 by cosine
# Hope for the best
```

Semantic stress uses hard thresholds to **filter** chunks:

```
ΔS < 0.40     → STABLE (chunk is semantically fit)
ΔS 0.40-0.60  → TRANSITIONAL (risky, review before using)  
ΔS ≥ 0.60     → REJECT (will cause hallucinations)
```

## Why This Works: Engineering Tolerances

Think of it like bridge engineering:

**Cosine similarity** is like measuring distance:

> "These two points are 5 meters apart"

**Semantic stress** is like measuring load capacity:

> "This bridge will collapse under 500kg"

Cosine tells you chunks are "related." ΔS tells you if they'll **break your reasoning**.

## Real Example: The Numbers Tell the Story

Let's calculate both metrics for our subscription example:

```
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer('all-MiniLM-L6-v2')

query = "How do I cancel my free trial?"
chunk = "Subscriptions renew monthly or yearly depending on plan."

q_emb = model.encode(query, normalize_embeddings=True)
c_emb = model.encode(chunk, normalize_embeddings=True)

cosine = float(util.cos_sim(q_emb, c_emb)[0][0])
delta_s = 1 - cosine

print(f"Cosine: {cosine:.3f}")  # 0.457
print(f"ΔS: {delta_s:.3f}")      # 0.543
```

**The insight:**

- **Cosine 0.457** might rank this chunk in your top-10
- **ΔS 0.543** tells you it's in the **transitional danger zone**
- Traditional RAG would use this chunk
- Semantic filtering (ΔS < 0.60) would **reject it and prevent the hallucination**

## A More Dramatic Example: High Cosine, Total Failure

Here's where cosine similarity really falls apart:

```
Query: "How do I cancel my subscription after the free trial?"

Retrieved Chunk (cosine: 0.78):
"Subscriptions renew monthly or yearly, depending on your plan."

Metrics:
- Cosine: 0.78 (HIGH - ranks #1 or #2)
- ΔS: 0.54 (TRANSITIONAL - semantically weak)

Standard RAG output:
"Simply choose not to renew your plan at the end of the billing cycle."
❌ Doesn't explain trial cancellation process

With ΔS filtering (threshold 0.50 for transactional queries):
"This chunk discusses subscription renewal but doesn't address 
trial cancellation. Looking for content about trial-specific policies..."
✅ Identifies the gap, searches for better chunk
```

**Why this happens:**

- **Keyword overlap:** "subscription" appears in both
- **Semantic proximity:** Embeddings learn "cancel," "renew," "trial," "plan" are related
- **Surface match:** Vectors are close in embedding space
- **Intent mismatch:** Query asks about *trial cancellation*, chunk describes *renewal billing*

Cosine measures "are these about similar topics?" ΔS measures "can this chunk answer the question?"

## Implementation: Add 5 Lines to Your RAG Pipeline

Here's the minimal semantic filter:

```
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer('all-MiniLM-L6-v2')

def filter_by_semantic_stress(query: str, chunks: list[str], 
                               threshold: float = 0.60) -> list[str]:
    """Filter chunks by semantic fitness."""
    q_emb = model.encode(query, normalize_embeddings=True)

    filtered = []
    for chunk in chunks:
        c_emb = model.encode(chunk, normalize_embeddings=True)
        cosine = float(util.cos_sim(c_emb, q_emb)[0][0])
        delta_s = 1 - cosine

        if delta_s < threshold:
            filtered.append(chunk)

    return filtered

# In your RAG pipeline:
chunks = retriever.search(query, k=20)
safe_chunks = filter_by_semantic_stress(query, chunks)

if safe_chunks:
    context = "\n\n".join(safe_chunks)
    answer = llm.complete(f"Context: {context}\n\nQuestion: {query}")
else:
    answer = "No relevant content found. Please refine your query."
```

## When to Use Stricter Thresholds

Not all queries are equal. Adjust your threshold based on risk:

| Use Case | Threshold | Why |
| --- | --- | --- |
| High-stakes (medical, legal) | < 0.35 | Need very high confidence |
| Transactional (pricing, policies) | < 0.40 | Accuracy critical |
| General FAQ | < 0.50 | Some tolerance acceptable |
| Exploratory search | < 0.60 | Broader matching ok |

## Complete Diagnostic Pipeline

Here's a production-ready implementation with metrics:

```
import numpy as np
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer('all-MiniLM-L6-v2')

def diagnose_and_filter(query: str, chunks: list[dict], 
                        threshold: float = 0.60):
    """
    Complete diagnostic pipeline with metrics.

    Args:
        query: User query
        chunks: List of dicts with 'text' and 'id' keys
        threshold: ΔS rejection threshold

    Returns:
        {
            'accepted': list[dict],
            'rejected': list[dict],
            'stats': dict
        }
    """
    q_emb = model.encode(query, normalize_embeddings=True)

    accepted = []
    rejected = []
    delta_s_scores = []

    for chunk in chunks:
        c_emb = model.encode(chunk['text'], normalize_embeddings=True)
        cosine = float(util.cos_sim(c_emb, q_emb)[0][0])
        delta_s = 1 - cosine

        delta_s_scores.append(delta_s)

        chunk_with_metrics = {
            **chunk,
            'delta_s': delta_s,
            'cosine': cosine
        }

        if delta_s < threshold:
            accepted.append(chunk_with_metrics)
        else:
            rejected.append(chunk_with_metrics)

    return {
        'accepted': accepted,
        'rejected': rejected,
        'stats': {
            'total': len(chunks),
            'accepted_count': len(accepted),
            'rejected_count': len(rejected),
            'delta_s_mean': np.mean(delta_s_scores),
            'delta_s_min': np.min(delta_s_scores),
            'delta_s_max': np.max(delta_s_scores)
        }
    }

# Example usage
query = "How do I cancel my free trial?"
chunks = retriever.search(query, k=20)

result = diagnose_and_filter(query, chunks)

print(f"Accepted: {result['stats']['accepted_count']}/{result['stats']['total']}")
print(f"ΔS range: {result['stats']['delta_s_min']:.2f} - {result['stats']['delta_s_max']:.2f}")

if result['accepted']:
    context = "\n\n".join([c['text'] for c in result['accepted']])
    answer = llm.complete(f"Context: {context}\n\nQuestion: {query}")
else:
    answer = "No sufficiently relevant chunks found."
```

## What This Tells You About Your System

Run this on 100 queries and look at `delta_s_mean`:

- **ΔS < 0.30**: Your retrieval is excellent, chunks are highly aligned
- **ΔS 0.30-0.45**: Good retrieval, acceptable for production
- **ΔS 0.45-0.60**: Marginal quality, investigate further
- **ΔS > 0.60**: **Your retrieval is broken.** Fix this before tuning prompts.

## Key Takeaways

1. **Cosine measures proximity, ΔS measures fitness** - they're fundamentally different metrics
2. **Hard thresholds prevent hallucinations** - ΔS < 0.60 accept, ≥ 0.60 reject
3. **5-line semantic filter** - easy to add to any RAG stack
4. **Measurable acceptance criteria** - ΔS ≤ 0.45 for production readiness
5. **Works with any embedding model** - just normalize embeddings and invert cosine

## The Bottom Line

If you can't measure it, you can't fix it.

Cosine similarity measures "are these topics related?" That's useful for ranking. But for RAG, you need to know "will this chunk lead to a correct answer?"

That's what semantic stress gives you.

Stop guessing why your RAG system hallucinates. Start measuring semantic fitness.

---

**Want to go deeper?** I have written a comprehensive 400+ page RAG debugging guide walking through this any other steps - [https://mossforge.gumroad.com/l/rag-firewall](https://mossforge.gumroad.com/l/rag-firewall)

**Questions?** Drop them in the comments. I've debugged this across multiple production systems and happy to help troubleshoot!## Architect A Personalized Multi-Agent System with Long-Term Memory

In support of our mission to accelerate the developer journey on Google Cloud, we built Dev Signal — a multi-agent system designed to transform raw community signals into reliable technical guidance by automating the path from discovery to expert creation.