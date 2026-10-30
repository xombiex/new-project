import { describe, expect, it } from 'vitest';

import { bestPhoto, cleanModel, plainAuthor, scorePhoto } from './car-photos';

const big = { width: 3000, height: 2000, mime: 'image/jpeg' };
const page = (title: string, over: { license?: string; width?: number; height?: number } = {}) => ({
  title,
  imageinfo: [
    {
      thumburl: `https://upload.wikimedia.org/${title}`,
      width: over.width ?? 3000,
      height: over.height ?? 2000,
      mime: 'image/jpeg',
      descriptionurl: `https://commons.wikimedia.org/wiki/${title}`,
      extmetadata: { Artist: { value: '<a href="x">Jane Doe</a>' }, LicenseShortName: { value: over.license ?? 'CC BY-SA 4.0' } },
    },
  ],
});

describe('cleanModel', () => {
  it('drops the EPA spec words', () => {
    expect(cleanModel('Tacoma 4WD')).toEqual(['Tacoma']);
    expect(cleanModel('F150 Pickup 2WD')).toEqual(['F150']);
    expect(cleanModel('911 GT3 RS')).toEqual(['911', 'GT3', 'RS']);
  });
});

describe('scorePhoto', () => {
  it('needs the make and the model in the name', () => {
    expect(scorePhoto({ title: 'File:2021 Toyota Tacoma TRD.jpg', ...big }, 'Toyota', 'Tacoma', 2021)).not.toBeNull();
    expect(scorePhoto({ title: 'File:2021 Toyota Camry.jpg', ...big }, 'Toyota', 'Tacoma', 2021)).toBeNull();
    expect(scorePhoto({ title: 'File:Ford F-150 XLT.jpg', ...big }, 'Ford', 'F150 Pickup 2WD', null)).not.toBeNull();
  });

  it('does not confuse car names and shows with the words it filters', () => {
    expect(scorePhoto({ title: 'File:2021 Toyota Tacoma Geneva Motor Show.jpg', ...big }, 'Toyota', 'Tacoma', 2021)).not.toBeNull();
    expect(scorePhoto({ title: 'File:2020 SEAT Leon FR.jpg', ...big }, 'SEAT', 'Leon', 2020)).not.toBeNull();
  });

  it('turns down parts, toys, wrecks and odd shapes', () => {
    for (const title of ['File:Toyota Tacoma interior.jpg', 'File:Toyota Tacoma engine bay.jpg', 'File:Toyota Tacoma Hot Wheels.jpg', 'File:Crashed Toyota Tacoma wreck.jpg']) {
      expect(scorePhoto({ title, ...big }, 'Toyota', 'Tacoma', null)).toBeNull();
    }
    expect(scorePhoto({ title: 'File:Toyota Tacoma.jpg', width: 2000, height: 3000 }, 'Toyota', 'Tacoma', null)).toBeNull();
    expect(scorePhoto({ title: 'File:Toyota Tacoma.jpg', width: 400, height: 300 }, 'Toyota', 'Tacoma', null)).toBeNull();
  });

  it('prefers the right year, then the front of the car', () => {
    const at = (title: string) => scorePhoto({ title, ...big }, 'Ford', 'Mustang', 1967)!;
    expect(at('File:1967 Ford Mustang.jpg')).toBeGreaterThan(at('File:1969 Ford Mustang.jpg'));
    expect(at('File:1969 Ford Mustang.jpg')).toBeGreaterThan(at('File:2020 Ford Mustang.jpg'));
    expect(at('File:1967 Ford Mustang front.jpg')).toBeGreaterThan(at('File:1967 Ford Mustang rear.jpg'));
  });
});

describe('bestPhoto', () => {
  it('picks the top match and keeps the credit', () => {
    const photo = bestPhoto([page('File:2019 Ford Mustang.jpg'), page('File:1967 Ford Mustang front.jpg'), page('File:Ford Mustang engine.jpg')], 'Ford', 'Mustang', 1967);
    expect(photo).toEqual({
      url: 'https://upload.wikimedia.org/File:1967 Ford Mustang front.jpg',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:1967 Ford Mustang front.jpg',
      author: 'Jane Doe',
      license: 'CC BY-SA 4.0',
    });
  });

  it('only takes licenses that allow it', () => {
    expect(bestPhoto([page('File:1967 Ford Mustang.jpg', { license: 'Fair use' })], 'Ford', 'Mustang', 1967)).toBeNull();
    expect(bestPhoto([page('File:1967 Ford Mustang.jpg', { license: 'CC BY-NC 2.0' })], 'Ford', 'Mustang', 1967)).toBeNull();
    expect(bestPhoto([page('File:1967 Ford Mustang.jpg', { license: 'Public domain' })], 'Ford', 'Mustang', 1967)).not.toBeNull();
  });
});

describe('plainAuthor', () => {
  it('reads the name out of the HTML', () => {
    expect(plainAuthor('<bdi><a href="/wiki/User:Vauxford">Vauxford</a></bdi>')).toBe('Vauxford');
    expect(plainAuthor(undefined)).toBe('Wikimedia Commons');
  });
});
