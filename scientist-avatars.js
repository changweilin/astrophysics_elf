/* Comic-style scientist avatars for the Scientists page.
 *
 * Plain JS (no Babel) defining window.knSciAvatar(id, accent) -> an inline SVG
 * markup string with a flat, bold-outlined "comic panel" portrait. Faces are
 * composed parametrically from a small set of primitives (hair styles, facial
 * hair, glasses, collars) so every scientist is recognizable yet consistent in
 * style. Colours stay muted -- soft accent backgrounds, ink outlines, no neon
 * glare (matches the lab's visual language). Unknown ids return '' so callers
 * fall back to the initial-letter avatar.
 *
 * The returned <svg> fills its container (the round .sci-avatar wrapper clips
 * it to a circle), so the same markup works at every avatar size.
 */
(function () {
  var INK = '#2b2535';      // comic ink outline
  var WHITE = '#eef0f6';    // white hair / collars
  var SILVER = '#c4c7d2';
  var GREY = '#a9adba';
  var BROWN = '#6e4d38';
  var DKBROWN = '#46342a';
  var NEARBLK = '#352e2b';

  // ---- colour helpers (hex math for the soft accent background) ----
  function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
  function h2(n) { return clamp(n).toString(16).padStart(2, '0'); }
  function parse(hex) {
    hex = String(hex || '#7db3ff').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function mix(hex, target, t) {
    var a = parse(hex);
    return '#' + [0, 1, 2].map(function (i) { return h2(a[i] + (target - a[i]) * t); }).join('');
  }
  function lighten(hex, t) { return mix(hex, 255, t); }
  function darken(hex, t) { return mix(hex, 0, t); }

  // ---- per-scientist feature recipes ----
  var F = {
    einstein:      { skin: '#ecc5a2', hair: 'einstein', hairC: WHITE,  facial: 'mustache', facialC: WHITE,  collar: 'suit',       clothes: '#3b4763', mouth: 'slight' },
    feynman:       { skin: '#ecc5a2', hair: 'swept',    hairC: DKBROWN, facial: 'none',     facialC: INK,    collar: 'open',       clothes: '#445069', mouth: 'grin' },
    newton:        { skin: '#ecc5a2', hair: 'wig',      hairC: SILVER,  facial: 'none',     facialC: INK,    collar: 'cravat',     clothes: '#5b4a6b', mouth: 'neutral' },
    galileo:       { skin: '#e7bf9b', hair: 'receding', hairC: GREY,    facial: 'beardF',   facialC: GREY,   collar: 'robe',       clothes: '#6b3f49', mouth: 'neutral' },
    kepler:        { skin: '#ecc5a2', hair: 'curly',    hairC: DKBROWN, facial: 'beardS',   facialC: DKBROWN, collar: 'ruff',      clothes: '#3a4a52', mouth: 'neutral' },
    copernicus:    { skin: '#e7bf9b', hair: 'bob',      hairC: NEARBLK, facial: 'none',     facialC: INK,    collar: 'robe',       clothes: '#7a6a3e', mouth: 'neutral' },
    hubble:        { skin: '#ecc5a2', hair: 'slick',    hairC: DKBROWN, facial: 'none',     facialC: INK,    collar: 'suit',       clothes: '#3f4a66', mouth: 'slight', pipe: true },
    hawking:       { skin: '#ecc5a2', hair: 'thin',     hairC: SILVER,  facial: 'none',     facialC: INK,    collar: 'suit',       clothes: '#3d4660', glasses: 'rect', mouth: 'slight' },
    chandrasekhar: { skin: '#c79a6e', hair: 'back',     hairC: NEARBLK, facial: 'none',     facialC: INK,    collar: 'suit',       clothes: '#4a4640', glasses: 'round', mouth: 'slight' },
    sagan:         { skin: '#e7bf9b', hair: 'mop',      hairC: DKBROWN, facial: 'none',     facialC: INK,    collar: 'turtle',     clothes: '#5a6b6a', mouth: 'grin' },
    rubin:         { skin: '#edc8a6', hair: 'curlyF',   hairC: '#8a7a6e', facial: 'none',   facialC: INK,    collar: 'blouse',     clothes: '#6a5577', glasses: 'round', mouth: 'smile' },
    noether:       { skin: '#edc8a6', hair: 'bun',      hairC: NEARBLK, facial: 'none',     facialC: INK,    collar: 'lace',       clothes: '#4a6b4d', glasses: 'round', mouth: 'slight' },
    leavitt:       { skin: '#edc8a6', hair: 'bun',      hairC: '#5a4d41', facial: 'none',   facialC: INK,    collar: 'lace',       clothes: '#4f4056', mouth: 'slight' },
    lemaitre:      { skin: '#ecc5a2', hair: 'receding', hairC: '#555555', facial: 'none',   facialC: INK,    collar: 'priest',     clothes: '#1a1a1a', glasses: 'round', mouth: 'slight' },
    thorne:        { skin: '#ecc5a2', hair: 'receding', hairC: '#e2d1c3', facial: 'beardS', facialC: '#e2d1c3', collar: 'open',     clothes: '#3a5f6e', glasses: 'rect', mouth: 'smile' },
    bell:          { skin: '#edc8a6', hair: 'curlyF',   hairC: '#e6e9ef', facial: 'none',   facialC: INK,    collar: 'blouse',     clothes: '#63404b', glasses: 'round', mouth: 'smile' },
    halley:        { skin: '#ecc5a2', hair: 'wig',      hairC: '#c4c7d2', facial: 'none',   facialC: INK,    collar: 'cravat',     clothes: '#4a6358', mouth: 'slight' },
    herschel:      { skin: '#ecc5a2', hair: 'wig',      hairC: '#eef0f6', facial: 'none',   facialC: INK,    collar: 'cravat',     clothes: '#5b4a3a', mouth: 'smile' },
    maxwell:       { skin: '#ecc5a2', hair: 'swept',    hairC: '#5a4d41', facial: 'beardF', facialC: '#5a4d41', collar: 'suit',       clothes: '#3d4b54', mouth: 'neutral' },
    cannon:        { skin: '#edc8a6', hair: 'bun',      hairC: '#a9adba', facial: 'none',   facialC: INK,    collar: 'lace',       clothes: '#5c4366', mouth: 'slight' },
    zwicky:        { skin: '#ecc5a2', hair: 'receding', hairC: '#a9adba', facial: 'none',   facialC: INK,    collar: 'suit',       clothes: '#543b35', mouth: 'slight' },
    johnson:       { skin: '#d6a382', hair: 'curlyF',   hairC: '#a9adba', facial: 'none',   facialC: INK,    collar: 'blouse',     clothes: '#6b3f49', glasses: 'round', mouth: 'smile' },
  };

  function s(attrs) { return attrs; } // tiny readability shim

  // ---- background: soft accent panel + faint halftone dots ----
  function bg(accent) {
    var top = lighten(accent, 0.42);
    var bot = mix(accent, 0, 0.08); // gentle darker pool behind the shoulders
    var dot = darken(accent, 0.18);
    var dots = '';
    var pts = [[50, 9], [56, 13], [50, 17], [44, 12], [56, 21], [49, 25]];
    for (var i = 0; i < pts.length; i++) {
      dots += '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="1.4" fill="' + dot + '" fill-opacity="0.28"/>';
    }
    return '<rect x="0" y="0" width="64" height="64" fill="' + top + '"/>'
      + '<ellipse cx="32" cy="64" rx="30" ry="22" fill="' + bot + '" fill-opacity="0.55"/>'
      + dots;
  }

  // ---- shoulders + collar ----
  function shoulders(f) {
    var c = f.clothes;
    var body = '<path d="M9 64 Q11 50 22 47 Q27 51 32 51 Q37 51 42 47 Q53 50 55 64 Z" fill="' + c + '" stroke="' + INK + '" stroke-width="1.4"/>';
    var collar = '';
    switch (f.collar) {
      case 'suit':
        collar = '<path d="M27 49 L32 57 L37 49" fill="none" stroke="' + INK + '" stroke-width="1.4" stroke-linejoin="round"/>'
          + '<path d="M27 49 L24 64 M37 49 L40 64" stroke="' + darken(c, 0.25) + '" stroke-width="1.6"/>'
          + '<path d="M30 50 L32 64 L34 50" fill="' + WHITE + '" stroke="' + INK + '" stroke-width="0.8"/>'; // shirt V
        break;
      case 'open':
        collar = '<path d="M27 49 L31 56 M37 49 L33 56" stroke="' + darken(c, 0.22) + '" stroke-width="1.6" stroke-linecap="round"/>';
        break;
      case 'cravat':
        collar = '<path d="M29 49 Q32 58 35 49 Z" fill="' + WHITE + '" stroke="' + INK + '" stroke-width="1"/>'
          + '<path d="M30 54 Q32 60 34 54" fill="' + WHITE + '" stroke="' + INK + '" stroke-width="0.8"/>';
        break;
      case 'robe':
        collar = '<path d="M26 48 L32 64 L38 48" fill="none" stroke="' + darken(c, 0.28) + '" stroke-width="2"/>';
        break;
      case 'ruff':
        collar = '<path d="M20 49 Q32 44 44 49 Q44 54 32 55 Q20 54 20 49 Z" fill="' + WHITE + '" stroke="' + INK + '" stroke-width="1.2"/>'
          + '<path d="M23 50 L25 54 M28 49 L29 55 M32 49 L32 55 M36 49 L35 55 M41 50 L39 54" stroke="' + SILVER + '" stroke-width="0.9"/>';
        break;
      case 'turtle':
        collar = '<path d="M25 50 Q32 47 39 50 L39 56 Q32 53 25 56 Z" fill="' + lighten(c, 0.12) + '" stroke="' + INK + '" stroke-width="1.3"/>';
        break;
      case 'lace':
        collar = '<path d="M26 49 Q32 47 38 49 L37 56 Q32 54 27 56 Z" fill="' + WHITE + '" stroke="' + INK + '" stroke-width="1.1"/>'
          + '<circle cx="32" cy="51.5" r="1.1" fill="' + GREY + '"/>';
        break;
      case 'blouse':
        collar = '<path d="M27 49 L31 55 L29 50 M37 49 L33 55 L35 50" fill="' + lighten(c, 0.18) + '" stroke="' + INK + '" stroke-width="1"/>';
        break;
      case 'priest':
        collar = '<path d="M25 50 Q32 47 39 50 L39 56 Q32 53 25 56 Z" fill="' + NEARBLK + '" stroke="' + INK + '" stroke-width="1.3"/>'
          + '<rect x="30" y="50" width="4" height="6" fill="' + WHITE + '" stroke="' + INK + '" stroke-width="0.8"/>';
        break;
      default: collar = '';
    }
    return body + collar;
  }

  // ---- hair (drawn over the forehead). Some styles also have a back layer. ----
  function hairBack(f) {
    if (f.hair === 'bun') {
      return '<circle cx="32" cy="13.5" r="4.6" fill="' + f.hairC + '" stroke="' + INK + '" stroke-width="1.3"/>';
    }
    return '';
  }

  function hair(f) {
    var c = f.hairC, o = INK, w = 'stroke="' + o + '" stroke-width="1.3"';
    switch (f.hair) {
      case 'einstein':
        return '<g fill="' + c + '" ' + w + '>'
          + '<ellipse cx="18.5" cy="24" rx="5.2" ry="4.2"/><ellipse cx="17" cy="29.5" rx="4.4" ry="3.7"/><ellipse cx="22" cy="20" rx="4.6" ry="3.6"/>'
          + '<ellipse cx="45.5" cy="24" rx="5.2" ry="4.2"/><ellipse cx="47" cy="29.5" rx="4.4" ry="3.7"/><ellipse cx="42" cy="20" rx="4.6" ry="3.6"/>'
          + '<ellipse cx="32" cy="17.4" rx="3.4" ry="2.1"/>'
          + '</g>';
      case 'swept':
        return '<path d="M19 26 Q19 12 32 12 Q45 12 45 26 Q41 19 33 20 Q30 24 26 22 Q22 21 19 26 Z" fill="' + c + '" ' + w + '/>';
      case 'wig':
        return '<path d="M18 31 Q15 13 32 12 Q49 13 46 31 L46 41 Q46 46 42.5 45.5 Q43.6 40 42 36 L42 22 Q38 17.5 32 17.5 Q26 17.5 22 22 L22 36 Q20.4 40 21.5 45.5 Q18 46 18 41 Z" fill="' + c + '" ' + w + '/>'
          + '<circle cx="20" cy="43" r="2.2" fill="' + c + '" ' + w + '/><circle cx="44" cy="43" r="2.2" fill="' + c + '" ' + w + '/>';
      case 'receding':
        return '<g fill="' + c + '" ' + w + '>'
          + '<path d="M20 26 Q19 17 27 15 Q24 20 23.5 26 Z"/>'
          + '<path d="M44 26 Q45 17 37 15 Q40 20 40.5 26 Z"/>'
          + '</g>';
      case 'curly':
        return '<path d="M19 26 Q18 22 21 21 Q21 17 25 17.5 Q26 14 30 15 Q32 13 34 15 Q38 14 39 17.5 Q43 17 43 21 Q46 22 45 26 Q42 23 39 24 Q37 21 34 22 Q32 20 30 22 Q27 21 25 24 Q22 23 19 26 Z" fill="' + c + '" ' + w + '/>';
      case 'bob':
        return '<path d="M19 28 Q19 12 32 12 Q45 12 45 28 L45 34 Q45 36 43 36 L43 23 Q38 17.5 32 17.5 Q26 17.5 21 23 L21 36 Q19 36 19 34 Z" fill="' + c + '" ' + w + '/>';
      case 'slick':
        return '<path d="M20 25 Q20 13 32 13 Q44 13 44 25 Q40 18 31 19 Q28 23 24 21 Q22 21 20 25 Z" fill="' + c + '" ' + w + '/>'
          + '<path d="M34 15 Q37 19 38 24" fill="none" stroke="' + darken(c, 0.25) + '" stroke-width="1"/>';
      case 'thin':
        return '<path d="M21 23 Q23 15.5 32 15.5 Q41 15.5 43 23 Q39 19.5 32 19.5 Q25 19.5 21 23 Z" fill="' + c + '" ' + w + '/>';
      case 'back':
        return '<path d="M20 25 Q20 13 32 13 Q44 13 44 25 Q41 17.5 32 17.5 Q23 17.5 20 25 Z" fill="' + c + '" ' + w + '/>';
      case 'mop':
        return '<path d="M17 29 Q16 12 32 12 Q48 12 47 29 Q45 21 40 20 Q36 24 32 22.5 Q28 24 24 20 Q19 21 17 29 Z" fill="' + c + '" ' + w + '/>';
      case 'curlyF':
        return '<path d="M18 28 Q16 23 20 21 Q20 16 25 17 Q26 13 31 15 Q33 13 35 15 Q40 14 40 18 Q45 18 45 23 Q47 25 45 29 Q43 25 40 25 Q39 22 36 23 Q34 20 31 22 Q28 21 26 24 Q22 24 20 27 Q19 28 18 28 Z" fill="' + c + '" ' + w + '/>';
      case 'bun':
        return '<path d="M20 26 Q20 13 32 13 Q44 13 44 26 Q40 18 33 18 L32 14.5 L31 18 Q24 18 20 26 Z" fill="' + c + '" ' + w + '/>';
      default: return '';
    }
  }

  // ---- facial hair ----
  function facial(f) {
    var c = f.facialC, w = 'stroke="' + INK + '" stroke-width="1.2"';
    switch (f.facial) {
      case 'mustache':
        return '<path d="M26 38.5 Q29 37 32 38 Q35 37 38 38.5 Q35 41 32 39.6 Q29 41 26 38.5 Z" fill="' + c + '" ' + w + '/>';
      case 'beardF':
        return '<path d="M22 35 Q23 47 32 49 Q41 47 42 35 Q38 39 32 39 Q26 39 22 35 Z" fill="' + c + '" ' + w + '/>'
          + '<path d="M26 37.5 Q29 36 32 37 Q35 36 38 37.5 Q35 39.5 32 38.6 Q29 39.5 26 37.5 Z" fill="' + c + '"/>';
      case 'beardS':
        return '<path d="M25 37 Q26 44 32 45.5 Q38 44 39 37 Q36 40 32 40 Q28 40 25 37 Z" fill="' + c + '" ' + w + '/>'
          + '<path d="M27 37 Q29.5 35.5 32 36.5 Q34.5 35.5 37 37 Q34.5 39 32 38.2 Q29.5 39 27 37 Z" fill="' + c + '"/>';
      default: return '';
    }
  }

  // ---- glasses ----
  function glasses(f) {
    if (!f.glasses) return '';
    var o = INK;
    if (f.glasses === 'round') {
      return '<g fill="none" stroke="' + o + '" stroke-width="1.3">'
        + '<circle cx="27.5" cy="30.4" r="3.2"/><circle cx="36.5" cy="30.4" r="3.2"/>'
        + '<path d="M30.7 30 H33.3"/><path d="M24.3 29.4 L21.5 28.6"/><path d="M39.7 29.4 L42.5 28.6"/>'
        + '</g>';
    }
    // rectangular
    return '<g fill="none" stroke="' + o + '" stroke-width="1.3">'
      + '<rect x="24.3" y="27.8" width="6.4" height="4.8" rx="1.2"/><rect x="33.3" y="27.8" width="6.4" height="4.8" rx="1.2"/>'
      + '<path d="M30.7 30 H33.3"/><path d="M24.3 29 L21.5 28.4"/><path d="M39.7 29 L42.5 28.4"/>'
      + '</g>';
  }

  // ---- eyes / brows / nose / mouth ----
  function face(f) {
    var skin = f.skin;
    var parts = '';
    // ears
    parts += '<ellipse cx="20" cy="32" rx="2.3" ry="3.1" fill="' + skin + '" stroke="' + INK + '" stroke-width="1.2"/>';
    parts += '<ellipse cx="44" cy="32" rx="2.3" ry="3.1" fill="' + skin + '" stroke="' + INK + '" stroke-width="1.2"/>';
    // neck
    parts += '<path d="M28 41 h8 v6 q-4 2.4 -8 0 z" fill="' + darken(skin, 0.06) + '" stroke="' + INK + '" stroke-width="1.2"/>';
    // face
    parts += '<ellipse cx="32" cy="31" rx="12.2" ry="14" fill="' + skin + '" stroke="' + INK + '" stroke-width="1.6"/>';
    return parts;
  }

  function features(f) {
    var parts = '';
    // brows
    parts += '<path d="M24.6 27.4 Q27.5 26.2 30 27.2" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
    parts += '<path d="M34 27.2 Q36.5 26.2 39.4 27.4" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
    // eyes
    parts += '<circle cx="27.5" cy="30.4" r="1.5" fill="' + INK + '"/><circle cx="36.5" cy="30.4" r="1.5" fill="' + INK + '"/>';
    parts += '<circle cx="28" cy="29.9" r="0.45" fill="#fff" fill-opacity="0.8"/><circle cx="37" cy="29.9" r="0.45" fill="#fff" fill-opacity="0.8"/>';
    // nose
    parts += '<path d="M32 31 Q30.4 34 32.6 35.2" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
    // mouth (skipped when a full beard covers it)
    if (f.facial !== 'beardF') {
      var m;
      switch (f.mouth) {
        case 'grin': m = '<path d="M27.5 38.4 Q32 43 36.5 38.4 Q32 40.5 27.5 38.4 Z" fill="' + darken(f.skin, 0.4) + '" stroke="' + INK + '" stroke-width="1.1"/>'; break;
        case 'smile': m = '<path d="M28 38.6 Q32 41.6 36 38.6" fill="none" stroke="' + INK + '" stroke-width="1.3" stroke-linecap="round"/>'; break;
        case 'slight': m = '<path d="M28.5 39 Q32 40.6 35.5 39" fill="none" stroke="' + INK + '" stroke-width="1.3" stroke-linecap="round"/>'; break;
        default: m = '<path d="M28.6 39.2 H35.4" fill="none" stroke="' + INK + '" stroke-width="1.3" stroke-linecap="round"/>';
      }
      parts += m;
    }
    return parts;
  }

  function pipe(f) {
    if (!f.pipe) return '';
    return '<path d="M35 39.5 H43 Q45 39.5 45 42 L45 44" fill="none" stroke="' + NEARBLK + '" stroke-width="2" stroke-linecap="round"/>'
      + '<ellipse cx="45" cy="44.4" rx="2" ry="1.3" fill="' + darken('#6e4d38', 0.1) + '" stroke="' + INK + '" stroke-width="0.8"/>';
  }

  function knSciAvatar(id, accent) {
    var f = F[id];
    if (!f) return '';
    accent = accent || '#7db3ff';
    var svg = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" '
      + 'style="display:block;width:100%;height:100%" aria-hidden="true" '
      + 'shape-rendering="geometricPrecision">';
    svg += bg(accent);
    svg += hairBack(f);
    svg += shoulders(f);
    svg += face(f);
    svg += hair(f);
    svg += features(f);
    svg += facial(f);
    svg += glasses(f);
    svg += pipe(f);
    svg += '</svg>';
    return svg;
  }

  var PNG_AVATARS = {
    einstein: true, feynman: true, newton: true, galileo: true, kepler: true,
    copernicus: true, hubble: true, hawking: true, chandrasekhar: true, sagan: true,
    rubin: true, noether: true, leavitt: true, lemaitre: true, thorne: true,
    bell: true, halley: true, herschel: true, maxwell: true, cannon: true,
    zwicky: true, johnson: true
  };
  window.knSciAvatar = knSciAvatar;
  window.knSciAvatarHas = function (id) { return !!PNG_AVATARS[id]; };
})();
