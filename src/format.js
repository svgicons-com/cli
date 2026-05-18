export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export function printSearchResults(payload) {
  const icons = payload.data || [];

  if (icons.length === 0) {
    console.log('No icons found.');
    return;
  }

  for (const icon of icons) {
    const set = icon.iconSet?.name ? ` - ${icon.iconSet.name}` : '';
    console.log(`${icon.id}\t${icon.name}${set}`);
    if (icon.pageUrl) {
      console.log(`  ${icon.pageUrl}`);
    }
  }

  if (payload.meta?.hasMore) {
    console.log(`More results available. Next offset: ${payload.meta.nextOffset}`);
  }
}

export function printCollection(collection) {
  console.log(`${collection.id}\t${collection.name}`);
  console.log(`  icons: ${collection.iconsCount ?? 0}`);
  console.log(`  framework: ${collection.framework || 'svg'}`);
  console.log(`  color: ${collection.colorPolicy || 'currentColor'}`);
  console.log(`  naming: ${collection.namingPolicy || 'kebab'}`);
  if (collection.showUrl) {
    console.log(`  ${collection.showUrl}`);
  }
}

export function printCollectionDetail(payload, options = {}) {
  const collection = payload.data || payload;
  printCollection(collection);

  if (collection.description) {
    console.log(`  description: ${collection.description}`);
  }

  const licenses = collection.licenseSummary || [];
  if (licenses.length > 0) {
    console.log('');
    console.log('Licenses:');
    for (const item of licenses) {
      console.log(`  ${item.license || 'Unknown'}: ${item.iconsCount || 0} icons`);
    }
  }

  const iconSets = collection.iconSetSummary || [];
  if (iconSets.length > 0) {
    console.log('');
    console.log('Icon sets:');
    for (const item of iconSets) {
      console.log(`  ${item.name || item.prefix}: ${item.iconsCount || 0} icons`);
    }
  }

  if (options.icons) {
    const icons = payload.icons?.data || [];
    if (icons.length > 0) {
      console.log('');
      console.log('Icons:');
      for (const icon of icons) {
        const set = icon.iconSet?.name ? ` - ${icon.iconSet.name}` : '';
        console.log(`  ${icon.id}\t${icon.name}${set}`);
      }
    }
  }
}

export function printExport(exportJob) {
  console.log(`Export ${exportJob.id}: ${exportJob.status}`);
  console.log(`  formats: ${(exportJob.formats || []).join(', ')}`);
  if (exportJob.statusUrl) {
    console.log(`  status: ${exportJob.statusUrl}`);
  }
  if (exportJob.downloadUrl) {
    console.log(`  download: ${exportJob.downloadUrl}`);
  }
}

export function printScanProposal(proposal, options = {}) {
  console.log(`Scanned ${proposal.stats.filesScanned} files in ${proposal.root}`);
  console.log(`Suggested collection: ${proposal.collection.name}`);
  console.log('');

  if (proposal.concepts.length > 0) {
    console.log('Detected UI concepts:');
    for (const concept of proposal.concepts.slice(0, 20)) {
      console.log(`  ${concept.name} (${concept.count})`);
    }
    console.log('');
  }

  if (proposal.existingIconIds.length > 0) {
    console.log(`Existing svgicons.com icon URLs found: ${proposal.existingIconIds.join(', ')}`);
    console.log('');
  }

  if ((proposal.generatedIconRefs || []).length > 0) {
    console.log(`Generated SVG imports found: ${proposal.generatedIconRefs.join(', ')}`);
    console.log('');
  }

  if (proposal.stats.inlineSvgCount > 0) {
    console.log(`Inline SVG blocks found: ${proposal.stats.inlineSvgCount}`);
    console.log('');
  }

  if (!options.modified) {
    console.log('No files were modified.');
  }
  console.log(`Next search: svgicons search "${proposal.concepts[0]?.name || 'dashboard'}"`);
  console.log(`Write manifest: svgicons scan "${proposal.root}" --write-manifest`);
  console.log(`Create collection: svgicons collection create --name "${proposal.collection.name}" --description "${proposal.collection.description}"`);
}
