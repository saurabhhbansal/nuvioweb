// Original NuvioWeb fixture for the future sandboxed plugin runtime.
//
// This file is NOT executed by the current application. It exists so the
// contract, quota and sandbox units can share one representative input and an
// expected normalized result. It must remain self-contained, original and
// contain no third-party code or credentials.
async function resolve(api, input) {
  const url = "https://media.example.com/fixture-1080.mp4";
  api.log("resolving", input.tmdbId);
  return [
    {
      sourceId: "fixture-plugin",
      sourceName: "Fixture plugin",
      streams: [
        {
          name: "Fixture original 1080p",
          title: "Fixture original 1080p",
          description: "Original fixture stream",
          quality: "1080p",
          url
        },
        {
          name: "Fixture blocked stream",
          url: "javascript:alert(1)"
        }
      ]
    }
  ];
}
