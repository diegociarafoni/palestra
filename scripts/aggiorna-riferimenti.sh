#!/usr/bin/env bash
# Scarica le pagine ufficiali in Markdown di React e MUI usate dalle buone pratiche.
# Fonti: https://react.dev/llms.txt (CC BY 4.0), https://mui.com/material-ui/llms.txt e https://mui.com/x/llms.txt (MIT).
# Uso: bash scripts/aggiorna-riferimenti.sh  (dalla radice del repository)
set -euo pipefail
dl() { # url destinazione
  local tmp; tmp="$(mktemp)"
  curl -fsSL --max-time 30 "$1" -o "$tmp"
  { printf -- '<!-- Fonte: %s · scaricato il %s · licenza: %s -->\n\n' "$1" "$(date -u +%F)" "$3"; cat "$tmp"; } > "$2"
  rm -f "$tmp"
}
R=docs/riferimenti/react; M=docs/riferimenti/mui; L_R="CC BY 4.0 (react.dev)"; L_M="MIT (mui.com)"
for p in reference/rules reference/rules/components-and-hooks-must-be-pure reference/rules/rules-of-hooks \
         learn/thinking-in-react learn/you-might-not-need-an-effect learn/choosing-the-state-structure \
         learn/keeping-components-pure learn/typescript learn/react-compiler/introduction learn/react-compiler/installation \
         reference/react/StrictMode reference/react/Suspense reference/react/useActionState reference/react/useOptimistic; do
  dl "https://react.dev/$p.md" "$R/$(echo "$p" | tr '/' '_').md" "$L_R"
done
for p in getting-started/usage getting-started/accessibility getting-started/supported-platforms \
         customization/how-to-customize customization/theming customization/dark-mode customization/palette \
         customization/css-theme-variables/overview customization/css-theme-variables/usage customization/theme-components \
         guides/minimizing-bundle-size guides/typescript guides/composition \
         react-toggle-button react-text-field react-bottom-navigation; do
  dl "https://mui.com/material-ui/$p.md" "$M/$(echo "$p" | tr '/' '_').md" "$L_M"
done
for p in react-charts/quickstart react-charts/lines react-charts/bars; do
  dl "https://mui.com/x/$p.md" "$M/x_$(echo "$p" | tr '/' '_').md" "$L_M"
done
echo "riferimenti aggiornati"
