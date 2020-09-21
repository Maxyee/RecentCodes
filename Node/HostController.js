var _ = require('lodash');
const { Client } = require('pg');
const CryptoJS = require('crypto-js');
const { off } = require('../models/HostModel');
const matchSorter = require('match-sorter').default;

const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database('./ssmServer.db', sqlite3.OPEN_READWRITE);


// Postgres Query
const SQL =
  'select ssm_hosts.host_object_id as hostOID, ssm_hosts.host_name as hostName, ssm_tl_hosttype.type_value as host_type, ssm_hosts.address as address, ssm_view_hostdetail.current_state as current_state, systeminfo_bios.ver as bios_version, systeminfo_ipmi.me_fw_version as bmc_version, systeminfo_baseboard.model as baseboard_model from ssm_hosts left outer join systeminfo_bios on ssm_hosts.host_object_id = systeminfo_bios.host_object_id left outer join systeminfo_baseboard on ssm_hosts.host_object_id = systeminfo_baseboard.host_object_id left outer join systeminfo_ipmi on ssm_hosts.host_object_id = systeminfo_ipmi.host_object_id left outer join ssm_tl_hosttype on ssm_hosts.instance_id = ssm_tl_hosttype.hosttype_id left outer join ssm_view_hostdetail on ssm_hosts.host_object_id = ssm_view_hostdetail.host_object_id inner join ssm_objects on ssm_hosts.host_object_id = ssm_objects.object_id where ssm_objects.is_active = 1';

async function getHostsFromSSMServer(auth) {
  const client = new Client({
    host: auth.address,
    port: 9002,
    database: 'ssm', 
    user: auth.username,
    password: auth.password,
  });

  try {
    await client.connect();
    const { rows } = await client.query(SQL);
    return rows;
  } catch (ex) {
    console.log(`Something wrong happend ${ex}`);
    return [];
  } finally {
    await client.end()
  }
}

async function getHostsFromSSMServer_new(ssmServer) {
  const hosts = [];
  let ssm = ssmServer;

  var promise =
    new Promise(function (resolve, reject) {
      var responseObj;

      let sql = `SELECT * FROM ssmServerLite WHERE IPAddress = '${ssm}'`;

      if (ssm === 'all') {
        sql = `SELECT * FROM ssmServerLite`;
      }

      db.all(sql, function cb(err, rows) {
        if (err) {
          responseObj = {
            'error': err
          };
          reject(responseObj);
        } else {

          responseObj = rows;
          resolve(responseObj);
        }

      });
    });

  const servers =
    await promise.then((value) => {
      return value;
    }).catch((error) => {
      console.log(error);
    })

  for (let i = 0; i < servers.length; i++) {
    const server = servers[i];
    const decryptedByte = CryptoJS.AES.decrypt(server.password, process.env.AES_SECRET);
    const decryptedPassword = decryptedByte.toString(CryptoJS.enc.Utf8);
    const _authobj = {
      address: server.IPAddress,
      username: server.username,
      password: decryptedPassword
    }
    const _hosts = await getHostsFromSSMServer(_authobj);
    _hosts.forEach(host => {
      host.ssmServer = server.IPAddress;
      hosts.push(host);
    });
  }
  return hosts;

}

const host_keys = ['hostname', 'host_type', 'address', 'current_state', 'bios_version', 'bmc_version', 'baseboard_model', 'ssmServer'];

exports.getHosts = async (req, res) => {
  try {
    let { sort_by, search_by, page, size, ssm } = req.query;
    sort_by = sort_by !== undefined && sort_by !== null ? sort_by.split(',') : [];
    ssm = ssm !== undefined && ssm !== null && ssm !== '' ? ssm : 'all';

    const all_hosts = await getHostsFromSSMServer_new(ssm);

    let new_all_hosts = all_hosts;

    if (search_by !== undefined && search_by !== null && search_by !== '') {
      new_all_hosts = matchSorter(all_hosts, search_by, {
        keys: host_keys,
        threshold: matchSorter.rankings.CONTAINS,
      });
    }

    if (sort_by.length > 0) {
      const sort_key = [];
      const sort_order = [];
      for (let i = 0; i < sort_by.length; i++) {
        const tmp = sort_by[i].split('.');
        if (host_keys.includes(tmp[0])) {
          sort_key.push(tmp[0]);
          sort_order.push(tmp[1]);

          if (tmp[0] === 'hostname' || tmp[0] === 'address') {

            var promise =
              new Promise(function (resolve, reject) {
                var responseObj;

                let sql = `SELECT * FROM hostLite ORDER BY
                  CAST(substr(trim(hostname),1,instr(trim(hostname),'.')-1) AS INTEGER),  
                  CAST(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)),'.')-1) AS INTEGER), 
                  CAST(substr(substr(trim(hostname),length(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)),'.')))+length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)),'.')))+length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)),'.')-1) AS INTEGER), 
                  CAST(substr(trim(hostname),length(substr(substr(trim(hostname),length(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)),'.')))+length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)),'.')))+length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)),'.')))+ length(substr(trim(hostname),1,instr(trim(hostname),'.')))+length(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'.')))+1,length(hostname)),'.')))+1,length(trim(hostname))) AS INTEGER),
                  CAST(substr(trim(hostname),length(substr(substr(trim(hostname),length(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'_')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'_')))+1,length(hostname)),'_')))+length(substr(trim(hostname),1,instr(trim(hostname),'_')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'_')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'_')))+1,length(hostname)),'_')))+length(substr(trim(hostname),1,instr(trim(hostname),'_')))+1,length(hostname)),'_')))+ length(substr(trim(hostname),1,instr(trim(hostname),'_')))+length(substr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'_')))+1,length(hostname)) ,1, instr(substr(trim(hostname),length(substr(trim(hostname),1,instr(trim(hostname),'_')))+1,length(hostname)),'_')))+1,length(trim(hostname))) AS VARCHAR);
                `;

                db.all(sql, function cb(err, rows) {
                  if (err) {
                    responseObj = {
                      'error': err
                    };
                    reject(responseObj);
                  } else {

                    responseObj = rows;
                    resolve(responseObj);
                  }

                });
              });

            const collectedHosts =
              await promise.then((value) => {
                return value;
              }).catch((error) => {
                console.log(error);
              })

            if (tmp[1] === 'asc') {
              new_all_hosts = collectedHosts;
            }

            if (tmp[1] === 'desc') {
              new_all_hosts = collectedHosts.reverse();
            }

          }
          else if (tmp[0] === 'current_state') {
            var promise =
              new Promise(function (resolve, reject) {
                var responseObj;

                let sql = ``;

                if (tmp[1] === 'asc') {
                  sql = `SELECT * FROM hostLite WHERE current_state = 0`;
                }

                if (tmp[1] === 'desc') {
                  sql = `SELECT * FROM hostLite WHERE current_state = 1`;
                }

                db.all(sql, function cb(err, rows) {
                  if (err) {
                    responseObj = {
                      'error': err
                    };
                    reject(responseObj);
                  } else {

                    responseObj = rows;
                    resolve(responseObj);
                  }

                });
              });

            const currentStateHosts =
              await promise.then((value) => {
                return value;
              }).catch((error) => {
                console.log(error);
              })

            new_all_hosts = currentStateHosts;

          }
          else {
            new_all_hosts = _.orderBy(new_all_hosts, sort_key, sort_order);
          }

        }
      }
    }

    if (page !== undefined && page !== null && !isNaN(page) && page > 0) {
      const pageSize = size !== undefined && size !== null && !isNaN(size) && parseInt(size) > 0 ? parseInt(size) : 20;
      const start = (page - 1) * pageSize;
      new_all_hosts = start <= new_all_hosts.length ? new_all_hosts.splice(start, pageSize) : [];
    }

    res.send(new_all_hosts)
  } catch (error) {
    console.log(error);
    res.send(error)
  }
}
