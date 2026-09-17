export function validateRelease(release, expected) {
  if (
    !release ||
    release.format !== "phil-web-release-v1" ||
    release.sourceDigest !== expected.sourceDigest ||
    release.commit !== expected.commit ||
    release.preview !== expected.preview ||
    release.mainnetEnabled !== (expected.mainnetEnabled ?? false)
  )
    throw Error("WEB_STALE_RELEASE");
  return release;
}

export function createReleaseGuard(
  expected,
  {
    fetchImpl = fetch,
    serviceWorker = globalThis.navigator?.serviceWorker,
  } = {},
) {
  return async () => {
    if (
      serviceWorker?.controller ||
      (await serviceWorker?.getRegistrations())?.length
    )
      throw Error("WEB_STALE_RELEASE");
    const response = await fetchImpl("/release.json", {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("WEB_STALE_RELEASE");
    return validateRelease(await response.json(), expected);
  };
}
