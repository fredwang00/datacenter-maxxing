const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deploymentProfile, DEFAULT_SEGMENTS } = require('../docs/js/demand.js');
const { simulate } = require('../docs/js/engine.js');
const { DEFAULT_INPUTS } = require('../docs/js/presets.js');
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
const config = () => ({ ...DEFAULT_SEGMENTS.find(s => s.id === 'enterprise'),
  initialGw: 10, annualDemandGw: 0, demandGrowth: 0,
  apiShare: 1, managedShare: 0, rentedShare: 0, migrationRate: 0,
  apiIntensity: 1, apiUtilization: 0.6, apiCost: 1,
  managedIntensity: 1, managedUtilization: 0.6, managedCost: 1,
  rentedIntensity: 1, rentedUtilization: 0.6, rentedCost: 1,
  ownedIntensity: 1, ownedUtilization: 0.6, ownedCost: 1,
  efficiencyGain: 0, hardwareEfficiencyGain: 0, reboundElasticity: 0 });

test('migration preserves tasks and capacity when deployment efficiencies are equal', () => {
  const p = deploymentProfile({ ...config(), migrationRate: 0.2 }, 1);
  close(p.taskIndex, 100); close(p.requiredGw, 10);
  close(p.modes[0].share, 0.8);
  close(p.modes.reduce((n,m)=>n+m.share,0),1);
  close(p.routes.reduce((n,m)=>n+m.share,0),1);
});
test('half compute per task with unchanged utilization halves required capacity over time', () => {
  close(deploymentProfile({ ...config(), efficiencyGain: 0.5 },1).requiredGw,5);
});
test('lower utilization offsets efficiency and lower costs only add tasks with explicit rebound', () => {
  const c = { ...config(), migrationRate: 1, managedIntensity: 0.5, rentedIntensity: 0.5, ownedIntensity: 0.5,
    managedUtilization: 0.4, rentedUtilization: 0.4, ownedUtilization: 0.4,
    managedCost: 0.5, rentedCost: 0.5, ownedCost: 0.5 };
  close(deploymentProfile(c,1).requiredGw,7.5);
  close(deploymentProfile(c,1).taskIndex,100);
  close(deploymentProfile({ ...c, reboundElasticity: 1 },1).requiredGw,15);
});
test('invalid deployment settings fail instead of creating negative shares or infinite capacity', () => {
  for (const edit of [{apiShare:0.9, managedShare:0.2}, {apiUtilization:0}, {apiCost:0}, {migrationRate:2}])
    assert.throws(()=>deploymentProfile({...config(), ...edit},0));
});
test('full migration removes frontier API receipts but retains infrastructure budgets', () => {
  const demandSegments = DEFAULT_SEGMENTS.map(s=>s.id==='enterprise'?{...s,migrationRate:1}:s);
  const s=simulate({...DEFAULT_INPUTS,demandSegments},1)[1].demandBreakdown.segments.find(s=>s.id==='enterprise');
  close(s.frontierRevenueB,0);
  assert.ok(s.computeBudgetB>0);
  close(s.providerRevenueB,s.frontierRevenueB+s.managedRevenueB);
  close(s.customerSpendingB,s.providerRevenueB+s.directComputeBudgetB+s.directOperationsB);
  close(s.computeBudgetB,s.providerComputeBudgetB+s.directComputeBudgetB);
});
test('workload-based engine emits unmet tasks without creating physical capacity from migration', () => {
  for(const y of simulate(DEFAULT_INPUTS,1)) {
    close(Object.values(y.segmentCapacityGw).reduce((a,b)=>a+b,0)+y.hoardedStock,y.cumulativeGw);
    const workloads = y.demandBreakdown.segments.filter(s=>s.deployment);
    assert.equal(workloads.length,2);
    for(const s of workloads) {
      assert.ok(s.deployment.requiredGw>=0);
      assert.ok(s.servedTaskIndex<=s.deployment.taskIndex+1e-8);
    }
  }
});

test('yearly migration presets change frontier receipts with rebound disabled and preserve the task path', () => {
  const { PRESETS } = require('../docs/js/presets.js');
  const slow = simulate({...DEFAULT_INPUTS,...PRESETS['migration-slow']},1)[4].demandBreakdown.segments[1];
  const fast = simulate({...DEFAULT_INPUTS,...PRESETS['migration-fast']},1)[4].demandBreakdown.segments[1];
  close(slow.deployment.taskIndex,fast.deployment.taskIndex);
  assert.ok(fast.frontierRevenueB < slow.frontierRevenueB);
});
test('deployment controls expose migration, utilization, costs and rebound without retired capture controls', () => {
  const { segmentAssumptionsHtml, segmentDemandHtml } = require('../docs/js/render.js');
  const controls = segmentAssumptionsHtml(DEFAULT_SEGMENTS);
  for(const field of ['migrationRate','apiUtilization','rentedCost','reboundElasticity']) assert.ok(controls.includes(`data-field="${field}"`));
  assert.ok(!controls.includes('providerRevenueShare'));
  const panel = segmentDemandHtml(simulate(DEFAULT_INPUTS,1)[0]);
  for(const label of ['Frontier API','Managed open weights','Self-hosted / rented GPUs','Self-hosted / owned GPUs','unmet','Required IT capacity']) assert.ok(panel.includes(label));
});
test('frontier API delivery can rent infrastructure without becoming a different final use', () => {
  const p = deploymentProfile({...config(), apiOwnedShare:0.25},0);
  const lab = p.routes.filter(r=>r.assetOwner==='frontierLab').reduce((n,r)=>n+r.share,0);
  const rented = p.routes.filter(r=>r.assetOwner==='hyperscaler' && r.customer==='frontierLab').reduce((n,r)=>n+r.share,0);
  close(lab,0.25); close(rented,0.75); close(p.requiredGw,10);
});
test('unfulfilled workload accumulates independently of installed capacity', () => {
  // Initial 10 + 5 in 2026 + 5 in 2027 = 20 baseline GW-equivalents.
  const d=deploymentProfile({...config(),annualDemandGw:5},1);
  close(d.taskIndex,200);close(d.requiredGw,20);
});
