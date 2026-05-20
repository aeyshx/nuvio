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

// --- KEY FIX: Build name and title the way Nuvio actually renders them ---
// Nuvio shows `name` as the card header and `title` as the multi-line detail below.
// Putting quality/size in `name` is what makes them visible in actual (non-test) mode.

function buildStreamMeta(stream) {
  var quality = (stream.quality || '').trim();
  var size    = (stream.size    || '').trim();
  var codec   = (stream.codec   || '').trim();
  var source  = (stream.release || stream.source || '').trim();

  // name: short header shown on the stream card
  var nameParts = ['AyxImdb'];
  if (quality) nameParts.push(quality);
  if (size)    nameParts.push(size);
  var name = nameParts.join(' | ');

  // title: multi-line detail shown below the card header
  var line1Parts = [];
  if (quality) line1Parts.push('📺 ' + quality);
  if (size)    line1Parts.push('💾 ' + size);
  var line1 = line1Parts.join(' | ') || '📺 Stream';

  var line2Parts = [];
  if (source)                      line2Parts.push(source);
  if ((stream.encode || '').trim()) line2Parts.push(stream.encode.trim());
  if ((stream.format || '').trim()) line2Parts.push(stream.format.trim());
  if (codec)                        line2Parts.push(normalizeCodecLabel(codec));
  var line2 = line2Parts.length ? ('🎞️ ' + line2Parts.join(' ')) : '';

  var titleLines = [line1];
  if (line2) titleLines.push(line2);
  if (stream.label && stream.label.trim()) titleLines.push('ℹ️ ' + stream.label.trim());

  return {
    name:  name,
    title: titleLines.join('\n')
  };
}

function buildDownloadMeta(download, src) {
  var sz   = ((download.size || '').trim()) || '?';
  var tech = abbreviatedReleaseTech(download.title);
  var host = ((src.name || '').trim()).replace(/\s+\d+$/, '').trim();

  // name: short card header
  var name = 'AyxImdb | ' + sz;

  // title: detail lines
  var line1 = '💾 ' + sz;
  var line2 = '🎞️ ' + tech;
  var line3 = host ? ('🌐 ' + host) : '';

  var titleLines = [line1, line2];
  if (line3) titleLines.push(line3);

  return {
    name:  name,
    title: titleLines.join('\n')
  };
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
          streams.push({
            name:  ui.name,
            title: ui.title,
            url:   stream.url,
          });
        });
      } else if (data.downloads) {
        data.downloads.forEach(function(download) {
          (download.sources || []).forEach(function(src) {
            if (!src.url) return;
            var ui = buildDownloadMeta(download, src);
            streams.push({
              name:  ui.name,
              title: ui.title,
              url:   src.url,
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