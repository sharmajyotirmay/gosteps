import { type Page } from "@playwright/test";
import { expect, test, TEST_IDE } from "./fixtures";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { demoBundle } from "./seed";

// Regenerates docs/screenshots/*.png. Run with `pnpm screenshots` (after `pnpm build`).
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate README screenshots");

const out = join(import.meta.dirname, "../docs/screenshots");

async function loadDemo(page: Page) {
  const file = test.info().outputPath("demo.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(demoBundle()));
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("x");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Accept the System" }).click();
  await page.keyboard.press("Escape");
  await page.goto("/settings/");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("Imported backup for Jyotirmay")).toBeVisible();
}

const settle = (page: Page) => page.waitForTimeout(1600);

test("desktop screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadDemo(page);

  await page.goto("/");
  await settle(page);
  await page.screenshot({ path: `${out}/dashboard.png` });

  await page.getByRole("button", { name: /Open the System/ }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/system-window.png` });
  await page.getByRole("tab", { name: "Commands" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/system-commands.png` });
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /Continue:/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/quest.png` });

  await page.goto("/quests/boss-p3/");
  await page.getByLabel("go test output").fill(
    [
      "ok  \tgithub.com/jyotirmay/jobq/internal/job\t0.014s\tcoverage: 88.1% of statements",
      "ok  \tgithub.com/jyotirmay/jobq/internal/store\t1.302s\tcoverage: 76.4% of statements",
      "ok  \tgithub.com/jyotirmay/jobq/internal/worker\t0.911s\tcoverage: 71.9% of statements",
    ].join("\n"),
  );
  await page.getByText("This output is from a run with").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/gate-trial.png` });

  await page.goto("/review/");
  await page.getByRole("button", { name: /Show answer/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/review.png` });

  await page.goto("/dsa/");
  await settle(page);
  await page.screenshot({ path: `${out}/dsa.png` });
  await page.screenshot({ path: `${out}/dsa-full.png`, fullPage: true });

  await page.goto("/profile/");
  await settle(page);
  await page.screenshot({ path: `${out}/profile.png` });
});

test("IDE screenshot", async ({ page, request }) => {
  const h = await request.get(`${TEST_IDE}/health`).then((r) => r.json()).catch(() => null);
  test.skip(!h?.docker?.imageReady, "Docker sandbox not available");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript((url) => localStorage.setItem("gosteps.ideUrl", url), TEST_IDE);
  await loadDemo(page);
  const H = { "x-gosteps": "1" };
  await request.put(`${TEST_IDE}/file?path=jobq/internal/job/job.go`, { headers: H, data: `package job

import (
	"errors"
	"time"
)

// Status is where a job is in its lifecycle.
type Status int

const (
	StatusQueued Status = iota
	StatusRunning
	StatusSucceeded
	StatusFailed
)

var ErrInvalidTransition = errors.New("invalid status transition")

type Job struct {
	ID        string
	Type      string
	Payload   []byte
	Status    Status
	Attempts  int
	CreatedAt time.Time
}

// MarkRunning moves a queued job to running and counts the attempt.
func (j *Job) MarkRunning() error {
	if j.Status != StatusQueued {
		return ErrInvalidTransition
	}
	j.Status = StatusRunning
	j.Attempts++
	return nil
}
` });
  await request.put(`${TEST_IDE}/file?path=jobq/internal/job/job_test.go`, { headers: H, data: `package job

import (
	"errors"
	"testing"
)

func TestMarkRunning(t *testing.T) {
	tests := []struct {
		name    string
		from    Status
		wantErr error
	}{
		{"queued", StatusQueued, nil},
		{"already running", StatusRunning, ErrInvalidTransition},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			j := &Job{Status: tt.from}
			if err := j.MarkRunning(); !errors.Is(err, tt.wantErr) {
				t.Fatalf("got %v, want %v", err, tt.wantErr)
			}
		})
	}
}
` });
  await page.goto("/ide/?open=jobq%2Finternal%2Fjob%2Fjob.go");
  await expect(page.getByLabel("Editor: jobq/internal/job/job.go")).toBeVisible();
  await page.getByLabel("-v").check();
  await page.getByRole("button", { name: "Test -race" }).click();
  await expect(page.getByText(/exit 0/)).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/ide.png` });
});

test("phone screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Open the System/ }).click();
  await page.getByRole("tab", { name: "Status" }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/phone-system.png` });
});
