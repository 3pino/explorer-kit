import type { Component } from 'svelte';

/** アイコン（Lucide などの Svelte の部品） */
export type IconRef = Component<{ size?: number; class?: string }>;
