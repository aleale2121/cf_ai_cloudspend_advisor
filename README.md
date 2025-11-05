# Cloud FinOps Copilot (Agentic AI Project)

## Overview

**Cloud FinOps Copilot** is an **Agentic AI-powered application** built on **Cloudflare’s full-stack AI platform**.  
It assists cloud engineers and financial teams by analyzing **cloud billing plans and usage metrics**, providing **LLM-driven cost optimization insights** through a real-time chat interface.

---

## Features

- **LLM Integration:** Uses **Cloudflare Workers AI (Llama 3.3)** for relevance filtering & summaries, and **Google Gemini 2.0** for in-depth FinOps analysis.
- **Workflow & Coordination:** Orchestrated with **Cloudflare Workers** and **Durable Objects** for real-time multi-user chat persistence.
- **User Interaction:** Chat-based interface built with **React + TypeScript + TailwindCSS** (deployed via Cloudflare Pages).
- **Memory / State:** Uses **Cloudflare D1** (SQLite-compatible) for conversation, analysis, and message history.
- **File Storage:** Uses **Cloudflare R2** to store uploaded plan & metrics files securely.
- **Agentic Flow:** Each user query dynamically triggers LLM reasoning, analysis, and thread-aware state memory retrieval.

---

## Architecture

```markdown
┌────────────────────────────┐
│ Cloudflare Pages (React) │ ← Chat UI, uploads, real-timeupdates  
└──────────────┬─────────────┘
│
▼
┌────────────────────────────────┐
│ Cloudflare Worker (server) │ ← LLM orchestration, message routing
│ - Durable Object: Chat │
│ - Calls Llama 3.3 (Workers AI)│
│ - Calls Gemini (external API) │
└──────────────┬─────────────────┘
│
▼
┌────────────────────────────┐
│ D1 Database (SQLite) │ ← conversations, messages, analyses
│ R2 Storage (S3-like) │ ← uploaded billing/metrics files
└────────────────────────────┘
```

---

---

## Repository Structure

```markdown
.
.
├── migrations/ # D1 database migrations
│ └── 0001_initial_schema.sql
├── public/ # Static assets
├── src/
│ ├── app.tsx # Main application entry (React)
│ ├── components/ # UI components
│ ├── hooks/ # Reusable logic (e.g. useChat)
│ ├── server/ # Cloudflare Worker + Durable Object back-end
│ │ ├── ai/ # LLM + cost analysis logic (Gemini + Workers AI)
│ │ ├── api/ # HTTP API routes
│ │ ├── db/ # D1 access layer
│ │ ├── storage/ # R2 upload operations
│ │ └── utils/ # Shared helpers
│ ├── styles/ # Tailwind and CSS styling
│ └── types/ # Shared TypeScript types
├── PROMPTS.md # Required: AI prompt documentation
├── README.md # Documentation
├── wrangler.jsonc # Cloudflare config (bindings, deployments)
├── package.json
└── tsconfig.json
```

---

## Running the Project Locally (Development)

### 📦 Clone the Project

```bash
git clone https://github.com/aleale2121/cf_ai_finops_copilot.git
cd cf_ai_finops_copilot
npm install
```

### **1. Install Dependencies**

```bash
npm install
```

### **2. Create a D1 Database (Local / Dev Mode)**

```bash
npx wrangler d1 create COST_ANALYZER_DB --no-config
```

Copy the printed `database_id` and update `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "COST_ANALYZER_DB",
    "database_id": "YOUR_DATABASE_ID_HERE"
  }
]
```

### **3. Apply Database Schema**

```bash
npx wrangler d1 execute COST_ANALYZER_DB --local --file=migrations/0001_initial_schema.sql
```

### **4. Create R2 Bucket**

```bash
npx wrangler r2 bucket create cloud-finops-files --no-config
```

### **5. Set Your Gemini API Key**

```bash
npx wrangler secret put GOOGLE_GEMINI_API_KEY
```

### **6. Run the Worker + UI Locally**

```bash
npx wrangler dev
```

Local URL:

```markdown
http://127.0.0.1:8787
```

---

## Deploying to Production

### **1. Log In to Cloudflare**

```bash
npx wrangler login
```

### **2. Create Production D1 Database**

```bash
npx wrangler d1 create COST_ANALYZER_DB --no-config
```

Update the printed `database_id` inside `wrangler.jsonc` under **DB binding**.

### **3. Apply Schema to Production DB**

```bash
npx wrangler d1 execute COST_ANALYZER_DB --remote --file=migrations/0001_initial_schema.sql
```

### **4. Ensure R2 Bucket Exists**

```bash
npx wrangler r2 bucket create cloud-finops-files --no-config
```

### **5. Add Gemini API Key to Production**

```bash
npx wrangler secret put GOOGLE_GEMINI_API_KEY --environment production
```

### **6. Deploy**

```bash
npx wrangler deploy
```

### Your app is now live at

```markdown
https://<your-worker>.workers.dev
```

## Example Usage Flow

1. Upload **billing file** and **usage metrics file**
2. Ask any cloud cost or optimization question
3. LLM analyzes, summarizes, proposes savings strategies
4. Chat stays threaded + files referenced later

## Environment Bindings

| Binding                 | Type                  | Description            |
| ----------------------- | --------------------- | ---------------------- |
| `AI`                    | Workers AI            | Access to Llama 3.3    |
| `GOOGLE_GEMINI_API_KEY` | Secret                | API key for Gemini     |
| `DB`                    | D1 Database           | Persistent FinOps data |
| `FILES`                 | R2 Bucket             | File uploads           |
| `ASSETS`                | Pages / Static assets | Frontend               |
| `Chat`                  | Durable Object        | Stateful chat memory   |

## Example Prompts

- **Analysis prompt:** “Given PLAN, METRICS, COMMENT → produce FinOps summary + JSON of optimization areas.”
- **Summary prompt:** “Summarize key cloud spend drivers and suggested actions.”

## Deployment

**Live Demo:** [https://cloud-usage-advisor.alefew-yimer.workers.dev](https://cloud-usage-advisor.alefew-yimer.workers.dev)

---

## 👤 Author

**Alefew Yimer Yimam**  
[GitHub: aleale2121](https://github.com/aleale2121)

---

## 🧾 License

MIT License © 2025 Alefew Yimer Yimam
