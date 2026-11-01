import { createTask, expect, getTask, isoDaysFromNow, test } from './fixtures'

test('shows tasks on their due day, navigates months and reschedules by drag', async ({
  page,
  ws,
}) => {
  // Pick a date safely inside the current month so the drop target is on the same grid.
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: number) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(d)}`
  const from = iso(10)
  const to = iso(11)
  const task = await createTask(page.request, { title: 'Dentist', due_date: from })

  await page.goto(`${ws}/calendar`)
  await expect(
    page.getByTestId(`day-${from}`).getByRole('button', { name: 'Dentist' }),
  ).toBeVisible()

  // month navigation keeps the URL in sync
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page).toHaveURL(/month=\d{4}-\d{2}/)
  await expect(page.getByRole('button', { name: 'Dentist' })).toBeHidden()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Dentist' })).toBeVisible()

  // drag to the next day
  const chip = page.getByRole('button', { name: 'Dentist' })
  const target = page.getByTestId(`day-${to}`)
  const a = (await chip.boundingBox())!
  const b = (await target.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId(`day-${to}`).getByRole('button', { name: 'Dentist' })).toBeVisible()
  await expect.poll(async () => (await getTask(page.request, task.id)).due_date).toBe(to)

  // clicking a day lists everything due that day
  await page.getByTestId(`day-${to}`).getByRole('button', { name: /^11 / }).click()
  await expect(page).toHaveURL(new RegExp(`due=${to}`))
  await expect(page.getByTestId('task-row').filter({ hasText: 'Dentist' })).toBeVisible()
})

test('today view separates overdue tasks', async ({ page, ws }) => {
  await createTask(page.request, { title: 'Late', due_date: isoDaysFromNow(-2) })
  await createTask(page.request, { title: 'Now', due_date: isoDaysFromNow(0) })
  await page.goto(`${ws}/today`)
  await expect(page.getByRole('region', { name: 'Overdue' })).toContainText('Late')
  await expect(page.getByRole('region', { name: 'Today' })).toContainText('Now')
})
