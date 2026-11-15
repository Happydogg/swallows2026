/**
 * csvManager.js
 * Roster CSV export and multi-season identity-matched batch importer.
 */

import { supabaseClient } from './config.js';

export function exportTeamRosterCSV(players, getLatestMetric, getPlayerDisplayName) {
  if (!players || players.length === 0) {
    alert('No players to export.');
    return;
  }

  let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
  csvContent += 'HKLL_Reg_No,Jersey,Last_Name,Given_Names,Preferred_Name,DOB,Parent_Phone,Position,Throws,Bats,Bat_Spec,Current_Height_cm,Current_Weight_kg\r\n';

  players.forEach((p) => {
    const height = getLatestMetric(p.id, 'height_cm') || '';
    const weight = getLatestMetric(p.id, 'weight_kg') || '';

    const row = [
      `"${p.hkll_reg_no || ''}"`,
      p.jersey,
      `"${p.last_name || ''}"`,
      `"${p.given_names || ''}"`,
      `"${getPlayerDisplayName(p)}"`,
      p.dob || '',
      `"${p.parent_phone || ''}"`,
      `"${p.position || 'IF'}"`,
      p.throws || 'R',
      p.bats || 'R',
      `"${p.bat_spec || ''}"`,
      height,
      weight
    ];
    csvContent += row.join(',') + '\r\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Swallows_Roster_Template_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function importTeamRosterCSV(file, { players, sessions, getLatestMetric }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/);

        if (lines.length < 2) {
          alert('The CSV file appears empty or formatted incorrectly.');
          resolve({ updatedPlayers: 0, growthLogged: 0 });
          return;
        }

        let updatedPlayers = 0;
        let growthLogged = 0;
        const today = new Date().toISOString().slice(0, 10);
        const cleanStr = (s) => (s || '').replace(/['"]+/g, '').trim();

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
          if (cols.length < 5) continue;

          const hkllReg = cleanStr(cols[0]);
          const jersey = Number(cleanStr(cols[1]));
          const lastName = cleanStr(cols[2]);
          const givenNames = cleanStr(cols[3]);
          const preferredName = cleanStr(cols[4]);
          const dob = cols[5] ? cleanStr(cols[5]) : null;
          const phone = cols[6] ? cleanStr(cols[6]) : '';
          const position = cols[7] ? cleanStr(cols[7]) : 'IF';
          const throws = cols[8] ? cleanStr(cols[8]) : 'R';
          const bats = cols[9] ? cleanStr(cols[9]) : 'R';
          const batSpec = cols[10] ? cleanStr(cols[10]) : '';
          const height = cols[11] ? parseFloat(cleanStr(cols[11])) : null;
          const weight = cols[12] ? parseFloat(cleanStr(cols[12])) : null;

          if (!preferredName && !lastName) continue;

          // 1. Match by HKLL Reg No
          let targetPlayer = null;
          if (hkllReg && hkllReg.toLowerCase() !== 'new') {
            targetPlayer = players.find((p) => p.hkll_reg_no && p.hkll_reg_no.trim() === hkllReg);
          }

          // 2. Match by DOB + Last Name
          if (!targetPlayer && dob && lastName) {
            targetPlayer = players.find(
              (p) => p.dob === dob && (p.last_name || '').toLowerCase() === lastName.toLowerCase()
            );
          }

          // 3. Fallback match by Jersey #
          if (!targetPlayer && jersey) {
            targetPlayer = players.find((p) => p.jersey === jersey);
          }

          if (targetPlayer) {
            const payload = {
              jersey: jersey || targetPlayer.jersey,
              last_name: lastName || targetPlayer.last_name,
              given_names: givenNames || targetPlayer.given_names,
              preferred_name: preferredName || targetPlayer.preferred_name || targetPlayer.name,
              name: preferredName || targetPlayer.preferred_name || targetPlayer.name,
              hkll_reg_no: hkllReg || targetPlayer.hkll_reg_no,
              parent_phone: phone || targetPlayer.parent_phone,
              dob: dob || targetPlayer.dob,
              position,
              throws,
              bats,
              bat_spec: batSpec || targetPlayer.bat_spec
            };

            const { error } = await supabaseClient
              .from('players')
              .update(payload)
              .eq('id', targetPlayer.id);

            if (!error) {
              Object.assign(targetPlayer, payload);
              updatedPlayers++;
            }
          } else {
            const newPlayerPayload = {
              jersey: jersey || 99,
              last_name: lastName || null,
              given_names: givenNames || null,
              preferred_name: preferredName || `${givenNames} ${lastName}`.trim(),
              name: preferredName || `${givenNames} ${lastName}`.trim(),
              hkll_reg_no: hkllReg || null,
              parent_phone: phone,
              dob: dob || null,
              position,
              throws,
              bats,
              bat_spec: batSpec
            };

            const { data, error } = await supabaseClient
              .from('players')
              .insert([newPlayerPayload])
              .select();

            if (!error && data) {
              targetPlayer = data[0];
              players.push(targetPlayer);
              updatedPlayers++;
            }
          }

          // Log quarterly growth baseline if height or weight changed
          if (targetPlayer && (height || weight)) {
            const latestH = getLatestMetric(targetPlayer.id, 'height_cm');
            const latestW = getLatestMetric(targetPlayer.id, 'weight_kg');

            if (height !== latestH || weight !== latestW) {
              const sessionPayload = {
                player_id: targetPlayer.id,
                session_date: today,
                height_cm: height || latestH,
                weight_kg: weight || latestW,
                shoulder_check: 'Pass'
              };

              const { data: sData, error: sErr } = await supabaseClient
                .from('sessions')
                .insert([sessionPayload])
                .select();

              if (!sErr && sData) {
                sessions.unshift(sData[0]);
                growthLogged++;
              }
            }
          }
        }

        players.sort((a, b) => a.jersey - b.jersey);
        resolve({ updatedPlayers, growthLogged });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}