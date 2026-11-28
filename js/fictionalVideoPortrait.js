const FICTIONAL_PORTRAITS = Object.freeze({
  '8f6bfeaf-9bc9-4cd0-b8a2-5809cf2733e4': '00',
  '8760c9dd-9168-45fd-bb6d-4aae6526aa95': '07',
  '53a23db8-956a-4e21-868a-502cb278b035': '10',
  '2fc38b67-9a19-4e5f-81e2-fae4c80d7d7a': '12',
  'f275aa33-6f14-ec95-603e-302bb4cadb90': '21',
  '63022426-9184-8e23-a575-0694c8769456': '22',
  '1b69fc38-cc4a-d270-9fd1-109bce59d9cf': '23',
  '433a64cc-e42c-9473-5837-20a2b4c8f522': '24',
  'cefd5239-06a7-1fd4-0f76-448a8060351a': '25',
  '6968cda7-49ac-3484-4624-a351e494e3ef': '26',
  '2a0e66a5-da1e-a974-c85a-679efaa2427c': '27',
  'fec2fd06-43b6-a7de-224a-7b1e5993b82d': '28',
  'fc3da4ae-03f9-05fc-a4bf-a2eae0f7f2ab': '29',
  '025d4d0a-3fde-17af-ad68-1b63d0df6f1f': '30',
  '72f3285d-8897-a66f-718a-ba3da13aa906': '31',
  'c682df8f-f079-a34d-6c8c-753ab6ef8099': '32',
  'f4f6509a-b985-9485-7828-2d065f4086fd': '33',
  '0ee06598-7a2e-5561-33d3-51d2fe91c39b': '34',
  'f9e55bc2-d3c1-7d4d-d530-380117813197': '35',
  'b84c480a-1580-447a-9a4e-69605ade4ae8': '60',
  '88df0a1c-b28e-4f35-9329-06dee1eeb3c5': '61',
  'a61d0bf5-2eb1-4f67-b08d-6a93cfb8ce8b': '62',
  '429345ee-67d6-47d2-b884-fb030fb12d39': '63',
  'e8e816b6-963b-470a-827e-7188648bf2f3': '64',
  'dfca1302-cce4-48bc-b9e2-e82861fe901e': '65',
  'f32bf0a2-35fb-4e79-a632-28da1ba2faba': '99'
});

// Only the 26 owner-confirmed synthetic records are assigned new portraits.
// This lookup never fetches player records or confers access.
function fictionalPortraitFor(player) {
  const jersey = FICTIONAL_PORTRAITS[player?.id];
  return typeof jersey === 'string' && String(player?.jersey ?? '') === jersey
    ? '/assets/demo-players/' + jersey + '.jpg' : '';
}

export function fictionalVideoPortrait(player, allowedPhoto) {
  const fallback = fictionalPortraitFor(player);
  const jersey = String(player?.jersey ?? '');
  const illustration = '/assets/demo-players/' + jersey + '.svg';
  if (fallback && (!allowedPhoto || allowedPhoto === illustration ||
      allowedPhoto === 'https://sdl-ux-live.pages.dev' + illustration ||
      allowedPhoto === 'https://sdl-staging.pages.dev' + illustration)) return fallback;
  return allowedPhoto;
}
