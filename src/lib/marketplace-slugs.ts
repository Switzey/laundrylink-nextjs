export function marketplaceSlug(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function marketplaceLabel(value: string) {
  return decodeURIComponent(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
