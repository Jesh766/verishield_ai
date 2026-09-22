import fetch from "node-fetch";

async function testAuth() {
  console.log("Testing WRONG PASS...");
  const res1 = await fetch("http://127.0.0.1:8000/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode: "WRONG_PASS" }),
  });
  console.log("WRONG STATUS:", res1.status);
  console.log("WRONG BODY:", await res1.text());

  console.log("Testing RIGHT PASS (SIH26188)...");
  const res2 = await fetch("http://127.0.0.1:8000/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode: "SIH26188" }),
  });
  console.log("RIGHT STATUS:", res2.status);
  console.log("RIGHT BODY:", await res2.text());
}

testAuth();
