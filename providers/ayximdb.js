function normalizeCodecLabel(codec) {
  switch ((codec || '').trim().toLowerCase()) {
    case 'h264': case 'avc': case 'mpeg-4 avc': case 'mpeg4-avc': return 'H264';
    case 'h265': case 'hevc': case 'x265': return 'H265';
    case 'av1': return 'AV1';
    case 'vp9': return 'VP9';
    default: return (codec || '').trim().toUpperCase();
  }
}
 
function buildStreamLabel(stream) {
  var sizeText = (stream.size || '').trim();
 
  // Build the descriptive part — always normalize codec
  var desc = (stream.label || '').trim();
  if (!desc) {
    var parts = [];
    if ((stream.quality || '').trim())  parts.push(stream.quality.trim());
    var rel = ((stream.release || stream.source || '')).trim();
    if (rel)                            parts.push(rel);
    if ((stream.encode || '').trim())   parts.push(stream.encode.trim());
    if ((stream.format || '').trim())   parts.push(stream.format.trim());
    if ((stream.codec  || '').trim())   parts.push(normalizeCodecLabel(stream.codec));
    desc = parts.join(' ');
  }
  if (!desc) {
    var fb = [];
    if ((stream.quality || '').trim()) fb.push(stream.quality.trim());
    if ((stream.codec   || '').trim()) fb.push(normalizeCodecLabel(stream.codec));
    desc = fb.join(' ') || 'Stream';
  }
 
  // Only show [size] prefix when the API actually returned one
  return sizeText ? '[' + sizeText + ']  ' + desc : desc;
}
 
function buildDownloadLabel(download, src) {
  var sz   = ((download.size || '').trim()) || '?';
  var tech = abbreviatedReleaseTech(download.title);
  var base = '[' + sz + ']  ' + tech;
  var host = ((src.name || '').trim());
  if (host) host = host.replace(/\s+\d+$/, '').trim();
  return host ? (base + ' - ' + host) : base;
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
          streams.push({
            name:    'AyxImdb',
            title:   buildStreamLabel(stream),
            url:     stream.url,
            quality: (stream.quality || '').trim(),
          });
        });
      } else if (data.downloads) {
        data.downloads.forEach(function(download) {
          (download.sources || []).forEach(function(src) {
            if (!src.url) return;
            streams.push({
              name:    'AyxImdb',
              title:   buildDownloadLabel(download, src),
              url:     src.url,
              quality: '',
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
