/** Falha ao baixar um pedaço (chunk) do app: acontece quando sai uma versão nova e o navegador ainda aponta para os arquivos antigos. */
export const isChunkLoadError = (error: unknown): boolean =>
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk .* failed/i
    .test(error instanceof Error ? `${error.name} ${error.message}` : String(error));
