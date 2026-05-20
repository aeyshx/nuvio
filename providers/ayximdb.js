function normalizeCodecLabel(codec) {
  switch ((codec || '').trim().toLowerCase()) {
    case 'h264': case 'avc': case 'mpeg-4 avc': case 'mpeg4-avc': return 'H264';
    case 'h265': case 'hevc': case 'x265': return 'H265';
    case 'av1': return 'AV1';
    case 'vp9': return 'VP9';
    default: return (codec || '').trim().toUpperCase();
  }
}

// Detect resolution from any text field or filename
function detectQuality(texts) {
  var sources = Array.isArray(texts) ? texts : [texts];
  for (var i = 0; i < sources.length; i++) {
    var t = String(sources[i] || '').toLowerCase();
    if (!t) continue;
    if (/\b2160p\b/.test(t) || /\b4k\b/.test(t) || /\buhd\b/.test(t)) return '2160p';
    if (/\b1080p\b/.test(t)) return '1080p';
    if (/\b720p\b/.test(t))  return '720p';
    if (/\b480p\b/.test(t))  return '480p';
    if (/\b360p\b/.test(t))  return '360p';
  }
  return '';
}

// Extract the actual filename (with extension) from URL or stream fields
function extractFilename(stream) {
  var textFields = [stream.filename, stream.file, stream.name, stream.label, stream.title];
  for (var i = 0; i < textFields.length; i++) {
    var v = (textFields[i] || '').trim();
    if (v && /\.(mkv|mp4|avi|m4v|mov)$/i.test(v)) return v;
  }

  if (stream.url) {
    try {
      var path = stream.url.split('?')[0].split('#')[0];
      var segments = path.split('/');
      var last = decodeURIComponent(segments[segments.length - 1] || '');
      if (last && /\.(mkv|mp4|avi|m4v|mov)$/i.test(last)) return last;
    } catch (e) {}
  }

  var parts = [];
  if ((stream.quality || '').trim())               parts.push(stream.quality.trim());
  var rel = (stream.release || stream.source || '').trim();
  if (rel)                                         parts.push(rel);
  if ((stream.encode || '').trim())                parts.push(stream.encode.trim());
  if ((stream.format || '').trim())                parts.push(stream.format.trim());
  if ((stream.codec  || '').trim())                parts.push(normalizeCodecLabel(stream.codec));
  if ((stream.label  || '').trim())                parts.push(stream.label.trim());
  var desc = parts.join('.');
  if (desc) return desc + '.mkv';

  return 'stream.mkv';
}

function extractDownloadFilename(download, src) {
  var title = (download.title || '').trim();
  if (/\.(mkv|mp4|avi|m4v|mov)$/i.test(title)) return title;
  if (title) {
    var clean = title.replace(/\s+/g, '.').replace(/\.{2,}/g, '.');
    if (!/\.(mkv|mp4)$/i.test(clean)) clean = clean + '.mkv';
    return clean;
  }
  var srcName = (src.name || '').trim().replace(/\s+\d+$/, '').trim();
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

// Extract a clean short source/server name from a source field or URL
function extractSourceName(stream) {
  // Try stream.source or stream.release as label
  var srcField = (stream.source || stream.release || '').trim();
  if (srcField) return srcField;

  // Try to pull host name from URL
  if (stream.url) {
    try {
      var host = new URL(stream.url).hostname.replace(/^www\./, '');
      // Grab first meaningful segment: "pixeldrain.com" → "Pixeldrain"
      var seg = host.split('.')[0];
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    } catch (e) {}
  }
  return '';
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

          var filename   = extractFilename(stream);
          var size       = (stream.size || '').trim();
          var sourceName = extractSourceName(stream);
          var quality    = detectQuality([
            stream.quality, stream.label, stream.title,
            stream.release, stream.source, stream.encode,
            stream.format,  stream.codec,  filename, stream.url
          ]);

          // name:    "AyxImdb Pixeldrain"
          // title:   "Pixeldrain | 2160p | 66.41 GB"
          // quality: "Little.Women.2019.2160p....mkv"   ← bottom badge
          // size:    "66.41 GB"                         ← next to filename
          var titleParts = [];
          if (sourceName) titleParts.push(sourceName);
          if (quality)    titleParts.push(quality);
          if (size)       titleParts.push(size);

          streams.push({
            name:    'AyxImdb' + (sourceName ? ' ' + sourceName : ''),
            title:   titleParts.join(' | ') || 'Stream',
            quality: filename,
            size:    size,
            url:     stream.url,
          });
        });
      } else if (data.downloads) {
        data.downloads.forEach(function(download) {
          (download.sources || []).forEach(function(src) {
            if (!src.url) return;

            var filename   = extractDownloadFilename(download, src);
            var size       = (download.size || '').trim();
            var host       = (src.name || '').trim().replace(/\s+\d+$/, '').trim();
            var quality    = detectQuality([download.title, filename]);

            var titleParts = [];
            if (host)    titleParts.push(host);
            if (quality) titleParts.push(quality);
            if (size)    titleParts.push(size);

            streams.push({
              name:    'AyxImdb' + (host ? ' ' + host : ''),
              title:   titleParts.join(' | ') || 'Stream',
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