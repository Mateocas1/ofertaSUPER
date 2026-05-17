const DEFAULT_COUNT = 50;

export type VtexSuggestionVariables = {
  productOriginVtex: true;
  simulationBehavior: "default";
  hideUnavailableItems: true;
  advertisementOptions: {
    showSponsored: true;
    sponsoredCount: 2;
    repeatSponsoredProducts: false;
    advertisementPlacement: "autocomplete";
  };
  fullText: string;
  count: number;
  shippingOptions: [];
  variant: null;
};

export function buildSuggestionVariables(
  query: string,
  count = DEFAULT_COUNT,
): VtexSuggestionVariables {
  return {
    productOriginVtex: true,
    simulationBehavior: "default",
    hideUnavailableItems: true,
    advertisementOptions: {
      showSponsored: true,
      sponsoredCount: 2,
      repeatSponsoredProducts: false,
      advertisementPlacement: "autocomplete",
    },
    fullText: query,
    count,
    shippingOptions: [],
    variant: null,
  };
}

export function encodeQuery(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

export function getExtensionsWithQuery(query: string, hash: string, count = DEFAULT_COUNT) {
  return JSON.stringify({
    persistedQuery: {
      version: 1,
      sha256Hash: hash,
      sender: "vtex.store-graphql@3.x",
      provider: "vtex.search-graphql@0.x",
    },
    variables: encodeQuery(buildSuggestionVariables(query, count)),
  });
}

export function buildVtexRequest(query: string, hash: string, count = DEFAULT_COUNT) {
  const searchParams = new URLSearchParams({
    workspace: "master",
    maxAge: "medium",
    appsEtag: "remove",
    domain: "store",
    locale: "es-AR",
    operationName: "productSuggestions",
    variables: "{}",
    extensions: getExtensionsWithQuery(query, hash, count),
  });

  return {
    pathname: "/_v/segment/graphql/v1",
    search: searchParams.toString(),
  };
}