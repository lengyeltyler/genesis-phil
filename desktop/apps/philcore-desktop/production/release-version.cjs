'use strict';
const release=Object.freeze(require('./release-version.json'));
function assertReleaseMetadata({metadata,packageMetadata,plist}){
 if(!/^\d+\.\d+\.\d+$/.test(release.version)||!/^\d+$/.test(release.build)||
  metadata.version!==release.version||metadata.build!==release.build||
  packageMetadata.version!==release.version||packageMetadata.buildNumber!==release.build||
  plist.CFBundleShortVersionString!==release.version||plist.CFBundleVersion!==release.build)
  throw Error('PRODUCTION_VERSION_BUILD_MISMATCH');
}
module.exports={release,assertReleaseMetadata};
