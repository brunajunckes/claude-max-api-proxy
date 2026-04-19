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
    model: 'claude',
    messages: [
      { role: 'user', content: 'Hello' }
    ]
  });

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
    model: 'claude',
    messages: []
  });

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError, 'Should throw APIError');
  assert.ok((error as any)?.message.includes('cannot be empty'));
});

test('Input Validation - Invalid role', () => {
  const req = new MockRequest({
    model: 'claude',
    messages: [
      { role: 'invalid', content: 'Hello' }
    ]
  });

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('invalid role'));
});

test('Input Validation - Message content too long', () => {
  const longContent = 'x'.repeat(100001);
  const req = new MockRequest({
    model: 'claude',
    messages: [
      { role: 'user', content: longContent }
    ]
  });

  let error: Error | null = null;
  const next = (e?: any) => { error = e; };

  inputValidationMiddleware(req as any, {} as Response, next as NextFunction);

  assert.ok((error as any) instanceof APIError);
  assert.ok((error as any)?.message.includes('exceeds maximum length'));
});

test('Input Validation - Valid reasoning_effort', () => {
  const req = new MockRequest({
    model: 'opus',
    messages: [{ role: 'user', content: 'Hello' }],
    reasoning_effort: 'high'
  });

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

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  inputValidationMiddleware(req as any, {} as Response, next);

  assert.ok(nextCalled);
  assert.strictEqual((req as any).validatedBody.system, 'You are a helpful assistant');
});
