const searchMcpOptions = ["deepseek-web", "tavily"] as const;

export type SearchMcp = (typeof searchMcpOptions)[number];

export type SearchMcpSecrets = {
  deepseekApiKey?: string | undefined;
  tavilyApiKey?: string | undefined;
};

function hasSecret(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

export function selectSearchMcp(secrets: SearchMcpSecrets): SearchMcp {
  if (hasSecret(secrets.deepseekApiKey)) {
    return "deepseek-web";
  }
  if (hasSecret(secrets.tavilyApiKey)) {
    return "tavily";
  }
  throw new Error(
    "Either DEEPSEEK_API_KEY or TAVILY_API_KEY must be configured.",
  );
}

function requireSearchMcp(value: string | undefined): SearchMcp {
  const mcp = searchMcpOptions.find((candidate) => candidate === value);
  if (mcp === undefined) {
    throw new Error(
      `Selected search MCP must be supported (${searchMcpOptions.join(", ")}), received ${value ?? "missing"}.`,
    );
  }
  return mcp;
}

export type EngineGateInput = {
  selectResult: string | undefined;
  selectedMcp: string | undefined;
  deepseekEngineResult: string | undefined;
  tavilyEngineResult: string | undefined;
};

export function requireEngineCompletion(input: EngineGateInput): SearchMcp {
  if (input.selectResult !== "success") {
    throw new Error(
      `select_search_mcp did not succeed (${input.selectResult ?? "missing"}).`,
    );
  }
  const mcp = requireSearchMcp(input.selectedMcp);
  const [selectedName, selectedResult, unselectedName, unselectedResult] =
    mcp === "deepseek-web"
      ? [
          "deepseek-web",
          input.deepseekEngineResult,
          "tavily",
          input.tavilyEngineResult,
        ]
      : [
          "tavily",
          input.tavilyEngineResult,
          "deepseek-web",
          input.deepseekEngineResult,
        ];
  if (selectedResult !== "success") {
    throw new Error(
      `Engine (${selectedName}) did not succeed (${selectedResult ?? "missing"}).`,
    );
  }
  if (unselectedResult !== "skipped") {
    throw new Error(
      `Unselected engine (${unselectedName}) was expected to be skipped (${unselectedResult ?? "missing"}).`,
    );
  }
  return mcp;
}
