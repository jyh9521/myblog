const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const yaml = require('js-yaml');

test('Pages fallback never holds the primary Workers publishing queue', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/pages.yml', 'utf8'));
  assert.equal(workflow.concurrency, undefined, 'an entire-run lock lets Pages block the next primary release');
  assert.deepEqual(workflow.jobs.build.concurrency, { group: 'blog-primary-production', 'cancel-in-progress': false });
  assert.deepEqual(workflow.jobs.deploy.concurrency, { group: 'pages', 'cancel-in-progress': false });
  assert.equal(workflow.jobs.build.environment, undefined);
  assert.equal(workflow.jobs.deploy.needs, 'build');
  assert.equal(workflow.jobs.deploy.environment.name, 'github-pages');
  const steps = workflow.jobs.build.steps;
  const verifyPrimary = steps.findIndex(step => step.name === 'Verify primary release');
  const packFallback = steps.findIndex(step => step.uses === 'actions/upload-pages-artifact@v3' && step.with.path === 'out');
  assert.ok(verifyPrimary >= 0 && packFallback > verifyPrimary);
  assert.ok(!steps.some(step => step.uses?.startsWith('actions/configure-pages@')));
  assert.ok(!workflow.jobs.build.steps.some(step => step.uses?.startsWith('actions/deploy-pages@')));
  assert.equal(workflow.jobs.deploy.steps[0].uses, 'actions/configure-pages@v5');
  assert.ok(workflow.jobs.deploy.steps.some(step => step.id === 'deployment' && step.uses === 'actions/deploy-pages@v4'));
  assert.ok(!workflow.jobs.deploy['continue-on-error'] && !workflow.jobs.deploy.steps.some(step => step['continue-on-error']));
  assert.equal(workflow.permissions.pages, 'write');
  assert.equal(workflow.permissions['id-token'], 'write');
});

test('failed primary deployments preserve diagnostics without masking failure', () => {
  const steps = yaml.load(fs.readFileSync('.github/workflows/pages.yml', 'utf8')).jobs.build.steps;
  const deploy = steps.findIndex(step => step.id === 'deploy_primary');
  const archive = steps[deploy + 1];
  assert.equal(steps[deploy].run, 'node scripts/deploy-static-host.cjs');
  assert.ok(!steps[deploy]['continue-on-error']);
  assert.equal(archive.if, "failure() && steps.deploy_primary.outcome == 'failure'");
  assert.equal(archive.with.path, '${{ runner.temp }}/blog-wrangler-deploy/');
  assert.equal(archive.with['retention-days'], 14);
  assert.equal(steps[deploy + 2].name, 'Verify primary release');
});
