function normalizeCodecLabel(codec) {
  switch ((codec || '').trim().toLowerCase()) {
    case 'h264': case 'avc': case 'mpeg-4 avc': case 'mpeg4-avc': return 'H264';
    case 'h265': case 'hevc': case 'x265': return 'H265';
    case 'av1': return 'AV1';
    case 'vp9': return 'VP9';
    default: return (codec || '').trim().toUpperCase();
  }
}

// Extract the actual filename (with extension) from URL or stream fields
function extractFilename(stream) {
  // 1. Try explicit filename-like fields that already have an extension
  var textFields = [stream.filename, stream.file, stream.name, stream.label, stream.title];
  for (var i = 0; i < textFields.length; i++) {
    var v = (textFields[i] || '').trim();
    if (v && /\.(mkv|mp4|avi|m4v|mov)$/i.test(v)) return v;
  }

  // 2. Pull filename from the URL path
  if (stream.url) {
    try {
      var path = stream.url.split('?')[0].split('#')[0];
      var segments = path.split('/');
      var last = decodeURIComponent(segments[segments.length - 1] || '');
      if (last && /\.(mkv|mp4|avi|m4v|mov)$/i.test(last)) return last;
    } catch (e) {}
  }

  // 3. Build a descriptive pseudo-filename from what the API gives us
  var parts = [];
  if ((stream.quality || '').trim())                parts.push(stream.quality.trim());
  var rel = (stream.release || stream.source || '').trim();
  if (rel)                                          parts.push(rel);
  if ((stream.encode || '').trim())                 parts.push(stream.encode.trim());
  if ((stream.format || '').trim())                 parts.push(stream.format.trim());
  if ((stream.codec  || '').trim())                 parts.push(normalizeCodecLabel(stream.codec));
  if ((stream.label  || '').trim())                 parts.push(stream.label.trim());
  var desc = parts.join('.');
  if (desc) return desc + '.mkv';

  return 'stream.mkv';
}

// Extract filename for the downloads path from the download title
function extractDownloadFilename(download, src) {
  // Try source name first
  var srcName = (src.name || '').trim().replace(/\s+\d+$/, '').trim();

  // Try pulling from download.title (usually looks like a release filename)
  var title = (download.title || '').trim();
  if (/\.(mkv|mp4|avi|m4v|mov)$/i.test(title)) return title;

  // Build from title tokens
  if (title) {
    var clean = title.replace(/\s+/g, '.').replace(/\.{2,}/g, '.');
    if (!/\.(mkv|mp4)$/i.test(clean)) clean = clean + '.mkv';
    return clean;
  }

  return (srcName || 'stream') + '.mkv';
}

function abbreviatedReleaseTech(rawTitle) {
  if (!rawTitle || !rawTitle.trim()) return 'Stream';
  var stem = rawTitle.trim().replace(/\.[^.]+$/, '') || rawTitle.trim();
  var qm = stem.match(/(?:^|\.)(\d{3,4}p|4k)(?:\.|$)/i);
  var cropped;
  if (qm) {
    cropped = stem.substring(stem.indexOf(qm[1], qm.index));
  } else {
    var ym = stem.match(/\.((?:19|20)\d{2})\./);
    cropped = ym ? stem.substring(ym.index + ym[0].length) : stem;
  }
  var tokens = cropped.split('.').filter(function(t) { return t.length > 0; });
  return tokens.join(' ').replace(/blu\s*ray/gi, 'BluRay').trim() || stem.replace(/\./g, ' ');
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[AyxImdb] getStreams → tmdbId=' + tmdbId + ' type=' + mediaType);

  if (mediaType !== 'movie') {
    return Promise.resolve([]);
  }

  var apiUrl = 'https://goatapi.imreallydagoatt.workers.dev/api/downloader/movie/' + tmdbId;

  return fetch(apiUrl)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data || data.success !== true) {
        console.log('[AyxImdb] GoatAPI success=false');
        return [];
      }

      var streams = [];

      if (data.streams && data.streams.length > 0) {
        data.streams.forEach(function(stream) {
          if (!stream.url) return;

          var filename = extractFilename(stream);
          var size     = (stream.size || '').trim();

          // Layout matches hdhub4u exactly:
          //   name    → "AyxImdb"          (card header)
          //   title   → tech/release info   (line below header)
          //   quality → full filename.mkv   (shown where "720p" would be)
          //   size    → "20.92 GB"          (shown next to quality as "filename.mkv • 20.92 GB")
          var tech = abbreviatedReleaseTech(
            [stream.release, stream.source, stream.encode, stream.format, stream.label].join('.')
          );

          streams.push({
            name:    'AyxImdb',
            title:   tech || filename,
            quality: filename,
            size:    size,
            url:     stream.url,
          });
        });
      } else if (data.downloads) {
        data.downloads.forEach(function(download) {
          (download.sources || []).forEach(function(src) {
            if (!src.url) return;

            var filename = extractDownloadFilename(download, src);
            var size     = (download.size || '').trim();
            var host     = (src.name || '').trim().replace(/\s+\d+$/, '').trim();

            streams.push({
              name:    'AyxImdb' + (host ? ' ' + host : ''),
              title:   abbreviatedReleaseTech(download.title),
              quality: filename,
              size:    size,
              url:     src.url,
            });
          });
        });
      }

      console.log('[AyxImdb] Returning ' + streams.length + ' stream(s)');
      return streams;
    })
    .catch(function(err) {
      console.error('[AyxImdb] Error: ' + err.message);
      return [];
    });
}

module.exports = { getStreams };