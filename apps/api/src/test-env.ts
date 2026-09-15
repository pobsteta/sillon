// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://sillon:sillon@localhost:5432/sillon_test?schema=public';
process.env.SESSION_SECRET ??= 'secret-de-test-secret-de-test-32ch';
