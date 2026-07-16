export function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

export async function sendMessage<T>(
  message: Record<string, unknown>,
): Promise<T> {
  const response: T & { error?: string } =
    await chrome.runtime.sendMessage(message);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response;
}

export function showStatus(
  element: HTMLElement,
  message: string,
  error = false,
): void {
  element.textContent = message;
  element.classList.toggle("error", error);
}

export function downloadText(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
