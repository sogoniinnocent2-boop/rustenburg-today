import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const drill = fs.mkdtempSync(path.join(os.tmpdir(), "rt-restore-"));
if (path.resolve(drill) === path.resolve("data")) throw new Error("Refusing to drill on the live data directory");
process.env.DATA_DIR = drill;
process.env.SEED_DEMO = "false";

async function main() {
const { useTestDatabase } = await import("../src/server/init");
const { closeDb, get } = await import("../src/server/db");
const { dataDir } = await import("../src/server/crypto");
const { grantRole } = await import("../src/server/permissions");
const { loadUser, registerAccount, requestPrivilegedRole, decideRoleRequest, verifyEmail } = await import("../src/server/auth");
const { createPost } = await import("../src/server/community");
const { createOrder, createProduct, moderateProduct } = await import("../src/server/commerce");
const { publishBook } = await import("../src/server/shelf");

useTestDatabase(drill);

function account(name: string) {
  const created = registerAccount({ email: `${name}@example.com`, password: "password123", displayName: name, dateOfBirth: "1991-05-05", acceptedTerms: true, guardianConsent: false, locale: "en", ip: name });
  return verifyEmail(created.verifyToken);
}

const buyer = account("buyer");
const seller = account("seller");
let admin = account("staff");
grantRole(admin.id, "administrator");
admin = loadUser(admin.id)!;
requestPrivilegedRole(seller, "seller");
const request = get<{ id: string }>("SELECT id FROM role_requests WHERE user_id = ? AND role_name = 'seller'", seller.id)!;
decideRoleRequest(admin, request.id, true);
const selling = loadUser(seller.id)!;
const post = createPost(selling, { postType: "update", body: "Restore drill post about the city market." });
const book = publishBook(selling, { title: "Restore Notes", description: "A free book for the restore drill.", language: "en", sample: "This sample is long enough to satisfy the book sample rule.", body: "This full text is long enough to satisfy the book body rule for the drill.", priceCents: 0, rights: true });
const product = createProduct(selling, { title: "Restore Barber", description: "A listing created only inside the disposable drill database.", priceRands: "80.00", condition: "service", categorySlug: "barbers" });
moderateProduct(admin, product.id, "publish");
const order = createOrder(buyer, product.id, 1, "collection");
const { loginAccount } = await import("../src/server/auth");
const { saveUploadBytes } = await import("../src/server/uploads");
const { createBackup } = await import("../src/server/backup");
const signedIn = loginAccount("buyer@example.com", "password123", { ip: "drill" });
const upload = saveUploadBytes(signedIn.user, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "drill.jpg", "image");

function snapshot() {
  const stored = get<{ storage_path: string }>("SELECT storage_path FROM uploads WHERE id = ?", upload.id);
  const mediaPath = stored ? path.join(dataDir(), stored.storage_path) : "";
  return {
    users: get<{ count: number }>("SELECT COUNT(*) as count FROM users")?.count,
    profiles: get<{ count: number }>("SELECT COUNT(*) as count FROM profiles WHERE display_name = 'buyer'")?.count,
    posts: get<{ count: number }>("SELECT COUNT(*) as count FROM community_posts WHERE body LIKE 'Restore drill%'")?.count,
    books: get<{ count: number }>("SELECT COUNT(*) as count FROM books WHERE slug = ?", book.slug)?.count,
    listings: get<{ count: number }>("SELECT COUNT(*) as count FROM products WHERE slug = ?", product.slug)?.count,
    orders: get<{ count: number }>("SELECT COUNT(*) as count FROM marketplace_orders WHERE id = ?", order.id)?.count,
    unpaid: get<{ payment_status: string }>("SELECT payment_status FROM marketplace_orders WHERE id = ?", order.id)?.payment_status,
    sessions: get<{ count: number }>("SELECT COUNT(*) as count FROM sessions WHERE user_id = ?", buyer.id)?.count,
    mediaBytes: mediaPath && fs.existsSync(mediaPath) ? fs.statSync(mediaPath).size : 0,
  };
}

const before = snapshot();
const offsite = fs.mkdtempSync(path.join(os.tmpdir(), "rt-offsite-"));
process.env.BACKUP_OFFSITE_DIR = offsite;
const started = Date.now();
const saved = createBackup({ allowSameVolume: true });
closeDb();
const live = path.join(dataDir(), "rustenburg.db");
const uploads = path.join(dataDir(), "uploads");
fs.rmSync(live);
fs.rmSync(uploads, { recursive: true, force: true });
fs.copyFileSync(saved.offsiteDb, live);
fs.cpSync(saved.offsiteDb.replace(/\.db$/, "-uploads"), uploads, { recursive: true });
const after = snapshot();
const same = JSON.stringify(before) === JSON.stringify(after);
const seconds = Number(((Date.now() - started) / 1000).toFixed(2));
console.log(JSON.stringify({ drill, offsite, before, after, same, seconds, post: post.id, order: order.paymentStatus }));
if (!same || after.unpaid !== "unpaid" || !after.users || !after.profiles || !after.posts || !after.books || !after.listings || !after.orders || !after.sessions || after.mediaBytes !== 4) process.exit(1);
}

main();
