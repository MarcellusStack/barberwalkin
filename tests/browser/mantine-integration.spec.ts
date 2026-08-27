import { expect, test } from "@playwright/test";

test("wendet das helle Theme und die responsive PostCSS-Ausgabe an", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mantine");

  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "light",
  );
  await expect(page.getByRole("main")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );

  const surface = page.getByTestId("theme-surface");
  await expect(surface).toHaveCSS("padding-top", "24px");

  const submit = page.getByRole("button", { name: "Shop anlegen" });
  await expect(submit).toHaveCSS("background-color", "rgb(17, 17, 17)");
  await expect(submit).toHaveCSS("border-radius", "6px");

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(surface).toHaveCSS("padding-top", "48px");
});

test("zeigt leeren, fehlerhaften, ladenden und erfolgreichen Formularzustand", async ({
  page,
}) => {
  await page.goto("/mantine");

  await expect(
    page.getByRole("heading", { name: "Noch kein Shop eingerichtet" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Shop anlegen" }).click();
  await expect(page.getByText("Shopname ist erforderlich")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Shopname" })).toBeFocused();

  await page.getByRole("textbox", { name: "Shopname" }).fill("Kamm & Klinge");
  await page.getByRole("button", { name: "Shop anlegen" }).click();
  await expect(
    page.getByRole("button", { name: "Shop wird angelegt" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("status", { name: "Shop wird angelegt" }),
  ).toBeAttached();
  await expect(
    page.getByRole("alert").filter({ hasText: "Kamm & Klinge ist bereit." }),
  ).toBeVisible();
});
