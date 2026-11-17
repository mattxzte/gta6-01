// Screenshot staging for Solmar Heat: ?shot=cover|foot|mission|city
// puts the game into a photogenic, fully-playing state (menu hidden,
// a mission running, cars and police on screen) and then raises
// window.__shotReady so the screenshot driver knows the frame is set.
import * as THREE from 'three';

function putPlayerInCarNear(G, x, z, heading) {
  const car = G.vehicles.nearestCar(x, z, 500, true) || G.vehicles.nearestCar(x, z, 500);
  if (!car) return null;
  G.player.setPosition(car.pos.x + 2.5, car.pos.z + 2.5, 0);
  G.vehicles.enterCar(car);
  car.pos.x = x;
  car.pos.z = z;
  car.heading = heading;
  car.speed = 12;
  G.camYaw = heading + Math.PI;
  return car;
}

function stageCover(G) {
  G.missions.startMission(0);
  const car = putPlayerInCarNear(G, 26, -60, 0);
  if (car) {
    // A couple of traffic cars ahead so the street reads as alive.
    const t1 = G.vehicles.spawnCar(26, 10, 0, { driver: 'traffic', loop: G.city.randomLoop(G.rng), maxSpeed: 11 });
    G.traffic.trafficCars.push(t1);
    G.traffic.aimAtLoopPoint(t1);
  }
  G.police.addWanted(2, 'staged chase');
  // Put the pursuit in the frame: one cruiser ahead in the player's lane
  // and one coming down the oncoming lane toward the camera.
  const cruisers = G.police.cruisers;
  if (cruisers[0]) {
    cruisers[0].pos.x = 26; cruisers[0].pos.z = -28;
    cruisers[0].heading = 0; cruisers[0].speed = 12;
  }
  if (cruisers[1]) {
    cruisers[1].pos.x = 20; cruisers[1].pos.z = 30;
    cruisers[1].heading = Math.PI; cruisers[1].speed = 10;
  }
}

function stageFoot(G) {
  G.missions.startMission(0);
  // On the road looking north up the tower avenue — never inside a block.
  G.player.setPosition(26, 44, Math.PI);
  G.camYaw = 0;
  G.camPitch = 0.32;
  G.police.addWanted(2, 'staged patrol');
  // A parked car right beside Jax, so the steal prompt reads on screen.
  const car = G.vehicles.nearestCar(26, 44, 500, true);
  if (car) {
    car.pos.x = 22.2;
    car.pos.z = 44;
    car.heading = Math.PI;
  }
}

function stageMission(G) {
  G.missions.completed = 1;
  G.missions.startMission(1);
  putPlayerInCarNear(G, -26, 60, Math.PI);
  G.police.addWanted(1, 'staged heat');
}

function stageCity(G) {
  G.missions.startMission(0);
  G.player.setPosition(0, 44, Math.PI);
  G.shotCamera = {
    pos: new THREE.Vector3(150, 190, 260),
    lookAt: new THREE.Vector3(-20, 0, -20),
  };
  G.police.addWanted(1, 'staged patrol');
}

export function stageShot(G, mode) {
  G.state = 'playing';
  G.hud.hideMenu();
  G.audio.ensure();
  // Keep the staging quiet: the objective pill already says the mission,
  // and a stack of toasts would crowd the frame.
  G.quiet = true;
  if (mode === 'cover') stageCover(G);
  else if (mode === 'foot') stageFoot(G);
  else if (mode === 'mission') stageMission(G);
  else if (mode === 'city') stageCity(G);
  else stageCover(G);
  G.quiet = false;
  // Long-lived so it survives a slow first load under swiftshader.
  G.hud.toast('SOLMAR HEAT — a coastal open-world crime game', 30000);
  // Let the scene settle for a moment, then tell the driver it is ready.
  setTimeout(() => { window.__shotReady = true; }, 1200);
}
