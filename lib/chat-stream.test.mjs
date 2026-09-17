import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_PROGRESS_LABELS, ChatStreamError, readChatStream } from './chat-stream.ts';

const encoder = new TextEncoder();
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function streamResponse(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'support-id' } });
}

test('progress updates arrive before the final answer is available', async () => {
  let source;
  const response = new Response(new ReadableStream({start(controller) { source = controller; }}),
    {headers: {'content-type': 'text/event-stream'}});
  const labels = [];
  let completed = false;
  const pending = readChatStream(response, label => labels.push(label)).then(result => {
    completed = true;
    return result;
  });
  source.enqueue(encoder.encode(frame('progress', {stage:'retrieving'})));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(labels, ['Fetching campus data…']);
  assert.equal(completed, false);
  source.enqueue(encoder.encode(frame('progress', {stage:'reviewing'})));
  source.enqueue(encoder.encode(frame('result', {status:200, body:{answer:'Checked answer'}})));
  assert.deepEqual(await (await pending).json(), {answer:'Checked answer'});
  assert.deepEqual(labels, ['Fetching campus data…', 'Checking the answer…']);
});

test('split UTF-8 and SSE boundaries preserve the answer and fixed labels', async () => {
  const wire = encoder.encode(frame('progress', {stage:'calculating'}) +
    frame('progress', {stage:'secret model reasoning'}) +
    frame('result', {status:200, body:{answer:'Café — ready'}}));
  const labels = [];
  const response = await readChatStream(streamResponse(Array.from(wire, byte => new Uint8Array([byte]))),
    label => labels.push(label));
  assert.deepEqual(await response.json(), {answer:'Café — ready'});
  assert.deepEqual(labels, ['Calculating…']);
  assert.equal(response.headers.get('x-request-id'), 'support-id');
});

test('terminal failures retain their status and error details for the existing UI handler', async () => {
  const error = {requestId:'request-42', error:{code:'model_timeout', retryable:true, message:'Too long'}};
  const response = await readChatStream(streamResponse([
    encoder.encode(frame('result', {status:504, body:error})),
  ]), () => {});
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), error);
});

test('interrupted or malformed streams do not produce a partial answer', async () => {
  for (const wire of [frame('progress', {stage:'composing'}), 'event: result\ndata: {bad}\n\n']) {
    await assert.rejects(readChatStream(streamResponse([encoder.encode(wire)]), () => {}), ChatStreamError);
  }
});

test('legacy JSON responses and early HTTP errors remain unchanged', async () => {
  for (const status of [200, 429, 503]) {
    const response = new Response('{}', {status, headers:{'content-type':'application/json'}});
    assert.equal(await readChatStream(response, () => assert.fail('No progress expected')), response);
  }
});

test('labels are single-line descriptions of actual operations', () => {
  assert.equal(CHAT_PROGRESS_LABELS.rewriting, undefined);
  for (const label of Object.values(CHAT_PROGRESS_LABELS)) assert.doesNotMatch(label, /[\r\n]/);
});

test('context follows real subjects and clears when the next stage has none', async () => {
  const updates = [];
  const subjects = [{topic:'menu', meal:'latenight', date_from:'2026-09-16'}];
  const wire = frame('progress', {stage:'retrieving', subjects}) +
    frame('progress', {stage:'reviewing', subjects, draft:'Never display this draft'}) +
    frame('progress', {stage:'calculating', operation:'duration'}) +
    frame('progress', {stage:'understanding'}) +
    frame('result', {status:200, body:{answer:'Final'}});
  await readChatStream(streamResponse([encoder.encode(wire)]), (label, detail) => updates.push({label, detail}));
  assert.equal(updates[0].detail, 'Looking up late-night menu items (Sep 16, 2026).');
  assert.equal(updates[1].detail, 'Checking claims about late-night menu items (Sep 16, 2026) against the retrieved sources.');
  assert.equal(updates[2].detail, 'Calculating the time between the selected times.');
  assert.equal(updates[3].detail, 'Reading your question and the conversation so far.');
  assert.doesNotMatch(JSON.stringify(updates), /Never display this draft/);
});

test('unrecognized metadata cannot surface arbitrary text or invalid dates', async () => {
  const updates = [];
  const wire = frame('progress', {stage:'reviewing', detail:'Unchecked prose', subjects:[
    {topic:'<script>bad</script>'},
    {topic:'menu', meal:'arbitrary draft', date_from:'2026-02-31'},
    {topic:'contacts', date_from:'secret text'},
  ]}) + frame('progress', {stage:'calculating', operation:'constructor'}) +
    frame('result', {status:200, body:{answer:'Final'}});
  await readChatStream(streamResponse([encoder.encode(wire)]), (_, detail) => updates.push(detail));
  assert.deepEqual(updates, [
    'Checking claims about menu items and campus contact details against the retrieved sources.',
    'Working through the selected numbers and times.',
  ]);
});

test('draft previews are explicitly scoped to review and never become final answers', async () => {
  let source;
  const response = new Response(new ReadableStream({start(controller) { source = controller; }}),
    {headers: {'content-type': 'text/event-stream'}});
  const previews = [];
  let completed = false;
  const pending = readChatStream(response, (_, __, draft) => previews.push(draft)).then(result => {
    completed = true;
    return result;
  });
  source.enqueue(encoder.encode(frame('progress', {stage:'reviewing', draft:'An unchecked answer.'})));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(previews, ['An unchecked answer.']);
  assert.equal(completed, false);
  source.enqueue(encoder.encode(frame('progress', {stage:'composing', draft:'Must not appear here.'})));
  source.enqueue(encoder.encode(frame('result', {status:200, body:{answer:'I could not verify that claim.'}})));
  assert.deepEqual(await (await pending).json(), {answer:'I could not verify that claim.'});
  assert.deepEqual(previews, ['An unchecked answer.', '']);
});
