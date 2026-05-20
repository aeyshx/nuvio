function normalizeCodecLabel(codec) {
  switch ((codec || '').trim().toLowerCase()) {
    case 'h264': case 'avc': case 'mpeg-4 avc': case 'mpeg4-avc': return 'H264';
    case 'h265': case 'hevc': case 'x265': return 'H265';
    case 'av1': return 'AV1';
    case 'vp9': return 'VP9';
    default: return (codec || '').trim().toUpperCase();
  }
}

// Scan every text field on a stream object for a resolution pattern
function detectQuality(stream) {
  var candidates = [
    stream.quality, stream.label, stream.title,
    stream.release, stream.source, stream.encode,
    stream.format,  stream.codec,  stream.url
  ];
  for (var i = 0; i < candidates.length; i++) {
    var t = String(candidates[i] || '').toLowerCase();
    if (!t) continue;
    if (/\b2160p\b/.test(t) || /\b4k\b/.test(t) || /\buhd\b/.test(t)) return '2160p';
    if (/\b1080p\b/.test(t)) return '1080p';
    if (/\b720p\b/.test(t))  return '720p';
    if (/\b480p\b/.test(t))  return '480p';
    if (/\b360p\b/.test(t))  return '360p';
  }
  // Guess from size as last resort
  var size = parseFloat(String(stream.size || '0'));
  if (size > 15)  return '2160p';  // >15 GB → likely 4K
  if (size > 4)   return '1080p';  // 4–15 GB → likely 1080p
  if (size > 1)   return '720p';
  return '';
}

function buildStreamMeta(stream) {
  var quality = detectQuality(stream);
  var size    = (stream.size    || '').trim();
  var codec   = normalizeCodecLabel(stream.codec || '');
  var source  = (stream.release || stream.source || stream.encode || stream.format || '').trim();
  var label   = (stream.label   || '').trim();

  // ── name: everything Nuvio reliably shows on the card ──────────────────
  // Format: "AyxImdb | 1080p | 2.1 GB | BluRay H265"
  var nameParts = ['AyxImdb'];
  if (quality) nameParts.push(quality);
  if (size)    nameParts.push(size);
  // append tech tokens if present
  var techParts = [];
  if (source) techParts.push(source);
  if (codec)  techParts.push(codec);
  if (techParts.length) nameParts.push(techParts.join(' '));
  var name = nameParts.join(' | ');

  // ── title: multi-line detail (shown in test mode / some Nuvio builds) ──
  var line1Parts = [];
  if (quality) line1Parts.push('📺 ' + quality);
  if (size)    line1Parts.push('💾 ' + size);
  var line1 = line1Parts.join(' | ') || '📺 Stream';

  var line2Parts = [];
  if (source) line2Parts.push(source);
  if (codec)  line2Parts.push(codec);
  var line2 = line2Parts.length ? ('🎞️ ' + line2Parts.join(' ')) : '';

  var titleLines = [line1];
  if (line2) titleLines.push(line2);
  if (label) titleLines.push('ℹ️ ' + label);

  return { name: name, title: titleLines.join('\n') };
}

function buildDownloadMeta(download, src) {
  var sz   = (download.size || '').trim() || '?';
  var tech = abbreviatedReleaseTech(download.title);
  var host = (src.name || '').trim().replace(/\s+\d+$/, '').trim();

  // Detect quality from download title + tech string
  var fakeStream = { label: download.title, size: sz };
  var quality = detectQuality(fakeStream);

  // ── name ──────────────────────────────────────────────────────────────
  var nameParts = ['AyxImdb'];
  if (quality) nameParts.push(quality);
  nameParts.push(sz);
  if (host) nameParts.push(host);
  var name = nameParts.join(' | ');

  // ── title ─────────────────────────────────────────────────────────────
  var line1Parts = [];
  if (quality) line1Parts.push('📺 ' + quality);
  line1Parts.push('💾 ' + sz);
  var line1 = line1Parts.join(' | ');
  var line2 = '🎞️ ' + tech;
  var line3 = host ? ('🌐 ' + host) : '';

  var titleLines = [line1, line2];
  if (line3) titleLines.push(line3);

  return { name: name, title: titleLines.join('\n') };
}

function mergeReleaseTokens(tokens) {
  var out = [];
  var i = 0;
  while (i < tokens.length) {
    var cur = tokens[i];
    var n   = tokens[i + 1];
    var nn  = tokens[i + 2];
    if (cur.toUpperCase() === 'MA' && n && nn &&
        /^\d{1,2}$/.test(n) && /^\d{1,2}$/.test(nn)) {
      out.push(cur + '.' + n + '.' + nn); i += 3; continue;
    }
    if (n && /^\d{1,2}$/.test(n) && /[a-zA-Z]/.test(cur) && /\d$/.test(cur)) {
      out.push(cur + '.' + n); i += 2; continue;
    }
    out.push(cur); i++;
  }
  return out;
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
  var merged = mergeReleaseTokens(tokens);
  var spaced = merged.join(' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\bMA\s+(\d)\s+(\d)\b/g, 'MA.$1.$2')
    .replace(/blu\s*ray/gi, 'BluRay')
    .trim();
  return spaced || stem.replace(/\./g, ' ');
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
          var ui = buildStreamMeta(stream);
          streams.push({ name: ui.name, title: ui.title, url: stream.url });
        });
      } else if (data.downloads) {
        data.downloads.forEach(function(download) {
          (download.sources || []).forEach(function(src) {
            if (!src.url) return;
            var ui = buildDownloadMeta(download, src);
            streams.push({ name: ui.name, title: ui.title, url: src.url });
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