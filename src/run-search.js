import { runSearchAgent } from "./agents/search-agent.js";

const SEARCH_STRINGS = [
    'LLM AI orchestration quantum computing platform',
    'QAOA VQE quantum circuit synthesis financial optimization',
    'portfolio optimization VaR CVaR quantum computing',
    'enterprise integration quantum workflow cloud',
    'end-to-end quantum computing business platform architecture'
]

const runId = await runSearchAgent(
    'Quantum Computing Business Platform for Financial Risk',
    SEARCH_STRINGS,
    {yearFrom: 2022, yearTo: 2026}
)

if(runId){
    console.log(`\nRun ID for next step: ${runId}`)
}