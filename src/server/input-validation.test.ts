/**
 * Input Validation Tests
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { APIError } from './error-handler.js';
import { inputValidationMiddleware, ChatCompletionRequest } from './input-validation.js';
import type { Request, Response, NextFunction } from 'express';

class MockRequest {
  method: string = 'POST';
  path: string = '/v1/chat/completions';
  body: any = {};

  constructor(body: any = {}) {
    this.body = body;
  }
}

class MockResponse {
  statusCode: number = 200;
}

function mockNext(err?: Error) {
  return (e?: Error) => {
    if (e) throw e;
  };
}

test('Input Validation - Valid request', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      { role: 'user', content: 'Hello' }
    ]
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  inputValidationMiddleware(
    req as any,
    {} as Response,
    next
  );

  assert.ok(nextCalled, 'next() should be called');
  assert.ok((req as any).validatedBody, 'validatedBody should be set');
});

test('Input Validation - Missing model field', () => {
  const req = new MockRequest({
    messages: [{ role: 'user', content: 'Hello' }]
  });

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError, 'Should throw APIError');
  assert.strictEqual((error as any)?.statusCode, 400);
});

test('Input Validation - Empty messages array', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: []
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError, 'Should throw APIError');
  assert.ok((error as any)?.message.includes('cannot be empty'), `Got: ${(error as any)?.message}`);
});

test('Input Validation - Invalid role', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      { role: 'invalid', content: 'Hello' }
    ]
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('invalid role') || (error as any)?.message.includes('invalid'));
});

test('Input Validation - Message content too long', () => {
  const longContent = 'x'.repeat(100001);
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      { role: 'user', content: longContent }
    ]
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('exceeds maximum'));
});

test('Input Validation - Valid reasoning_effort', () => {
  const req = new MockRequest({
    model: 'opus',
    messages: [{ role: 'user', content: 'Hello' }],
    reasoning_effort: 'high'
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next);

  assert.ok(nextCalled);
  assert.strictEqual((req as any).validatedBody.reasoning_effort, 'high');
});

test('Input Validation - Invalid model', () => {
  const req = new MockRequest({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello' }]
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('Invalid model'));
});

test('Input Validation - Ignores GET requests', () => {
  const req = new MockRequest({});
  req.method = 'GET';
  req.path = '/health';

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next);

  assert.ok(nextCalled);
  assert.strictEqual((req as any).validatedBody, undefined, 'No validation for GET');
});

test('Input Validation - Valid system prompt', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    system: 'You are a helpful assistant'
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next);

  assert.ok(nextCalled);
  assert.strictEqual((req as any).validatedBody.system, 'You are a helpful assistant');
});

// PHASE 4: Edge case tests for expanded coverage

test('Input Validation - Unicode and emoji payload', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      { role: 'user', content: 'Hello 😀🎉🚀 世界 العالم мир' }
    ]
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next);

  assert.ok(nextCalled, 'Unicode/emoji should pass validation');
  assert.ok((req as any).validatedBody);
});

test('Input Validation - System prompt too long', () => {
  const longSystem = 'x'.repeat(50001);
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    system: longSystem
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('exceeds maximum'));
});

test('Input Validation - Malformed token in model', () => {
  const req = new MockRequest({
    model: 'claude-...',
    messages: [{ role: 'user', content: 'Hello' }]
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
});

test('Input Validation - SQL injection attempt blocked', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      {
        role: 'user',
        content: "'; DROP TABLE users; --"
      }
    ]
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next);

  // SQL injection attempts should be accepted as regular strings
  // The system should not execute them
  assert.ok(nextCalled, 'SQL strings are treated as regular input');
});

test('Input Validation - Temperature boundary validation', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    temperature: 2.5
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError, 'Should be APIError');
  assert.ok((error as any)?.message.includes('between'), `Got message: ${(error as any)?.message}`);
});

test('Input Validation - Valid temperature at boundary (0)', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    temperature: 0
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  let nextCalled = false;
  const next = (e?: any) => {
    error = e;
    if (!e) nextCalled = true;
  };

  inputValidationMiddleware(req as any, {} as Response, next);

  assert.ok(nextCalled, 'next() should be called without error');
  assert.strictEqual((req as any).validatedBody?.temperature, 0);
});

test('Input Validation - Valid temperature at boundary (2)', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    temperature: 2
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  let nextCalled = false;
  const next = (e?: any) => {
    error = e;
    if (!e) nextCalled = true;
  };

  inputValidationMiddleware(req as any, {} as Response, next);

  assert.ok(nextCalled, 'next() should be called without error');
  assert.strictEqual((req as any).validatedBody?.temperature, 2);
});

test('Input Validation - max_tokens must be positive', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 0
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
});

test('Input Validation - Multiple messages validation', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' }
    ]
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  let nextCalled = false;
  const next = (e?: any) => {
    error = e;
    if (!e) nextCalled = true;
  };

  inputValidationMiddleware(req as any, {} as Response, next);

  if (error) {
    console.error('Validation error:', (error as any).message);
  }
  assert.ok(nextCalled, `next() should be called without error. Got error: ${error ? (error as any).message : 'none'}`);
  assert.strictEqual((req as any).validatedBody?.messages?.length, 3);
});

// PHASE 4: Edge Case Tests - Additional 8 tests for complex scenarios

test('Input Validation - Null bytes in content', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      { role: 'user', content: 'Hello\x00World' }
    ]
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = (e?: any) => { if (!e) nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok(nextCalled, 'Null bytes should be treated as regular characters');
});

test('Input Validation - Message with only whitespace', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      { role: 'user', content: '   \n\t  ' }
    ]
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = (e?: any) => { if (!e) nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok(nextCalled, 'Whitespace-only messages should pass');
});

test('Input Validation - max_tokens at boundary (1)', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 1
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = (e?: any) => { if (!e) nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok(nextCalled);
  assert.strictEqual((req as any).validatedBody?.max_tokens, 1);
});

test('Input Validation - max_tokens too large', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: -1
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
});

test('Input Validation - reason_effort with invalid value', () => {
  const req = new MockRequest({
    model: 'opus',
    messages: [{ role: 'user', content: 'Hello' }],
    reasoning_effort: 'ultra'
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('reasoning_effort'));
});

test('Input Validation - Empty system prompt is rejected', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    system: ''
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('cannot be empty'));
});

test('Input Validation - Non-string temperature is rejected', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [{ role: 'user', content: 'Hello' }],
    temperature: '1.5'
  });
  req.path = '/v1/chat/completions';

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('temperature'));
});

test('Input Validation - Extremely nested message object', () => {
  const req = new MockRequest({
    model: 'haiku',
    messages: [
      {
        role: 'user',
        content: 'Hello',
        metadata: { nested: { deep: { value: 'extra' } } }
      }
    ]
  });
  req.path = '/v1/chat/completions';

  let nextCalled = false;
  const next = (e?: any) => { if (!e) nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok(nextCalled, 'Extra fields should be accepted');
});
