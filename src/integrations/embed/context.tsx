import { createContext, useContext, type ParentComponent } from 'solid-js';

export type EmbedMode = 'standalone' | 'embedded';

export interface EmbedContextValue {
  mode: EmbedMode;
  bundleId: string | null;
  hookId: string | null;
  clickUrl: string | null;
}

const STANDALONE: EmbedContextValue = {
  mode: 'standalone',
  bundleId: null,
  hookId: null,
  clickUrl: null,
};

function nullIfMacro(value: string | null): string | null {
  if (value === null) return null;
  return value.startsWith('%%') ? null : value;
}

export function parseEmbedContext(search: string): EmbedContextValue {
  const params = new URLSearchParams(search);
  if (params.get('mode') !== 'embedded') return STANDALONE;
  return {
    mode: 'embedded',
    bundleId: nullIfMacro(params.get('bundleId')),
    hookId: nullIfMacro(params.get('hookId')),
    clickUrl: nullIfMacro(params.get('clickUrl')),
  };
}

const EmbedContext = createContext<EmbedContextValue>(STANDALONE);

export const EmbedProvider: ParentComponent = (props) => {
  const value =
    typeof window === 'undefined'
      ? STANDALONE
      : parseEmbedContext(window.location.search);
  return (
    <EmbedContext.Provider value={value}>
      {props.children}
    </EmbedContext.Provider>
  );
};

export function useEmbed(): EmbedContextValue {
  return useContext(EmbedContext);
}
