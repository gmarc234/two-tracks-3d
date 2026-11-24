import { test, expect } from '@playwright/test';

test('Gate 1 & 2: Two phones join, third is rejected, live presence works', async ({ browser }) => {
  const phone1 = await browser.newContext();
  const phone2 = await browser.newContext();
  const phone3 = await browser.newContext();

  const p1 = await phone1.newPage();
  const p2 = await phone2.newPage();
  const p3 = await phone3.newPage();

  // Phone 1 creates room
  await p1.goto('/');
  await p1.getByText('Create Room').click();
  const codeEl = p1.locator('span.font-mono');
  await expect(codeEl).toBeVisible({ timeout: 10000 });
  const roomCode = (await codeEl.textContent())!.trim();

  // Phone 2 joins room
  await p2.goto(`/join/${roomCode}`);
  await p2.getByText('Join Room').click();
  await expect(p1.getByText('Partner online')).toBeVisible({ timeout: 10000 });
  await expect(p2.getByText('Partner online')).toBeVisible({ timeout: 10000 });

  // Phone 3 attempts to join and is rejected by ROOM_FULL
  await p3.goto(`/join/${roomCode}`);
  await p3.getByText('Join Room').click();
  await expect(p3.getByText(/ROOM_FULL/i)).toBeVisible({ timeout: 10000 });
});
