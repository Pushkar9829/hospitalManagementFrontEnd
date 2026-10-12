import { catalogText } from '@hms/i18n/catalog';

/**
 * The design catalogue (menu labels, menu groups, role panels, screen titles) is English; this
 * gives the user's language where a translation exists and falls back to the English text.
 */
export function catalogFor(language) {
  const c = catalogText[String(language ?? 'en').slice(0, 2)];
  return {
    label: (screen, label) => c?.menu?.[screen]?.[label] ?? label,
    group: (group) => c?.groups?.[group] ?? group,
    panel: (code, name) => c?.panels?.[code]?.name ?? name,
    screen: (key, title) => c?.screens?.[key] ?? title,
  };
}

/** A menu from menuFor() with its groups and labels in the user's language. */
export function localizeMenu(menu, language) {
  const cat = catalogFor(language);
  return menu.map((g) => ({
    ...g,
    group: cat.group(g.group),
    items: g.items.map((it) => ({ ...it, label: cat.label(it.screen, it.label) })),
  }));
}
