import { loadEnvironment, credentialStatus } from '../server/config';
import { aiStatus } from '../server/provider';
import { aiTurn, type ChatState } from '../server/ai';
import { research } from '../server/research';
import { generate } from '../server/generator';
import { validate } from '../server/validation';
loadEnvironment();
const configured = credentialStatus();
const selected = aiStatus();
const status: Record<string, any> = {
  configured, selected,
  ai: { verified: false, reason: !configured[selected.keyName] ? `${selected.keyName} missing` : !selected.model ? 'Verified AI_MODEL missing' : 'pending' },
  research: { status: 'unconfigured', successfulSearches: 0 },
};
if (selected.configured) {
  try {
    const state: ChatState = { domain: 'employees', messages: [{role:'assistant',content:'ما نوع الشركة وكم موظفاً تحتاج؟'}], requirements:'', approved:false, revision:0 };
    const firstMessage = 'شركة مقاولات وخمسة أقسام وعشرة مشاريع و200 مهمة، 30% من الموظفين خبرتهم أكثر من خمس سنوات. اسألني عن عدد الموظفين.';
    const first = await aiTurn(state,firstMessage);
    state.messages.push({role:'user',content:firstMessage},{role:'assistant',content:first.result.reply});
    state.requirements = first.result.requirements;
    const second = await aiTurn(state,'100');
    const plan = second.plan;
    if (!plan) throw Error('NO_PLAN_AFTER_CONTEXTUAL_REPLY');
    const data = generate(plan);
    const validation = validate(plan,data);
    const employees = data.employees ?? [];
    const requestedCounts = employees.length === 100 && data.companies?.length === 1 && data.departments?.length === 5 && data.projects?.length === 10 && data.tasks?.length === 200;
    const exactDistribution = employees.filter(e=>Number(e.experience)>5).length === 30;
    status.ai = { verified: validation.valid && requestedCounts && exactDistribution, providerResponded:true, arabicTurns:2, contextualReply:'100', structuredPlan:true, actualRecordsValid:validation.valid, requestedCounts, exactDistribution, approvalRequiredBeforeAppGeneration:true };
  } catch (e) {
    status.ai = {verified:false,code:e && typeof e === 'object' && 'code' in e ? String(e.code) : 'LIVE_PLAN_OR_DATA_VERIFICATION_FAILED'};
  }
}
if (configured.TAVILY_API_KEY) {
  const result = await research('salary','employees.salary','software engineer salary Saudi Arabia');
  status.research = { status:result.status, successfulSearches:result.status === 'available' ? 1 : 0, relevantSources:result.evidence.length, appliedSources:result.evidence.filter(e=>e.applied).length, mode:'review-only' };
}
console.log(JSON.stringify(status,null,2));
if (!status.ai.verified || status.research.status !== 'available' || !status.research.relevantSources) process.exitCode=1;
