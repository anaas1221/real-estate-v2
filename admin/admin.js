let token = localStorage.getItem("adminToken");
if (!token) window.location.href = "login.html";

let allProps = [];
let modalInstance = null;

// دالة ضغط الصور
const compressImage = (
  file,
  quality = 0.7,
  maxWidth = 1200,
  maxHeight = 1200,
) => {
  return new Promise((resolve, reject) => {
    if (file.size < 200 * 1024) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const newFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, ".jpg"),
                { type: "image/jpeg", lastModified: Date.now() },
              );
              resolve(newFile);
            } else {
              reject(new Error("فشل ضغط الصورة"));
            }
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

window.toggleSidebar = function () {
  document.getElementById("sidebar").classList.toggle("open");
};

window.openAddModal = function () {
  document.getElementById("propId").value = "";
  document.getElementById("propertyForm").reset();
  document.getElementById("modalTitle").textContent = "إضافة عقار جديد";
  const modalEl = document.getElementById("propertyModal");
  modalInstance = new bootstrap.Modal(modalEl);
  modalInstance.show();
};

window.logout = function () {
  localStorage.removeItem("adminToken");
  window.location.href = "login.html";
};

window.editProp = async function (id) {
  const p = allProps.find((x) => x.id === id);
  if (!p) return;

  document.getElementById("propId").value = p.id;
  document.getElementById("f_title").value = p.title;
  document.getElementById("f_code").value = p.code || "";
  document.getElementById("f_price").value = p.price;
  document.getElementById("f_type").value = p.type;
  document.getElementById("f_purpose").value = p.purpose;
  document.getElementById("f_location").value = p.location || "";
  document.getElementById("f_area").value = p.area || "";
  document.getElementById("f_bedrooms").value = p.bedrooms || "";
  document.getElementById("f_bathrooms").value = p.bathrooms || "";
  document.getElementById("f_status").value = p.status;
  document.getElementById("f_featured").value = p.is_featured || 0;
  document.getElementById("f_sort").value = p.sort_order || 0;
  document.getElementById("f_floor").value = p.floor || "";
  document.getElementById("f_facebook").value = p.facebook || "";
  document.getElementById("f_youtube").value = p.youtube || "";
  document.getElementById("f_description").value = p.description || "";
  document.getElementById("modalTitle").textContent = "تعديل بيانات العقار";

  const modalEl = document.getElementById("propertyModal");
  modalInstance = new bootstrap.Modal(modalEl);
  modalInstance.show();
};

window.deleteProp = async function (id) {
  if (!confirm("هل أنت متأكد من حذف هذا العقار؟")) return;
  try {
    const res = await fetch(`/api/admin/properties/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      logout();
      return;
    }
    if (res.ok) {
      loadProps();
      alert("✅ تم الحذف بنجاح");
    } else {
      alert("❌ فشل الحذف");
    }
  } catch (e) {
    alert("❌ خطأ في الاتصال بالسيرفر");
  }
};

window.saveProperty = async function () {
  const id = document.getElementById("propId").value;
  const title = document.getElementById("f_title").value;
  const code = document.getElementById("f_code").value;
  const price = document.getElementById("f_price").value;
  const type = document.getElementById("f_type").value;
  const purpose = document.getElementById("f_purpose").value;
  const location = document.getElementById("f_location").value;
  const area = document.getElementById("f_area").value;
  const bedrooms = document.getElementById("f_bedrooms").value;
  const bathrooms = document.getElementById("f_bathrooms").value;
  const status = document.getElementById("f_status").value;
  const is_featured = document.getElementById("f_featured").value;
  const sort_order = document.getElementById("f_sort").value;
  const floor = document.getElementById("f_floor").value;
  const facebook = document.getElementById("f_facebook").value;
  const youtube = document.getElementById("f_youtube").value;
  const description = document.getElementById("f_description").value;
  const files = document.getElementById("f_images").files;

  if (!title || !price || !type || !purpose) {
    alert("❌ الرجاء إدخال العنوان، السعر، نوع العقار، والغرض.");
    return;
  }

  const saveBtn = document.querySelector("#propertyModal .btn-save");
  const originalText = saveBtn.innerHTML;
  saveBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span> جاري الحفظ...';
  saveBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("code", code || "");
    formData.append("price", price);
    formData.append("type", type);
    formData.append("purpose", purpose);
    formData.append("location", location || "");
    formData.append("area", area || 0);
    formData.append("bedrooms", bedrooms || 0);
    formData.append("bathrooms", bathrooms || 0);
    formData.append("status", status || "available");
    formData.append("is_featured", is_featured || 0);
    formData.append("sort_order", sort_order || 0);
    formData.append("floor", floor || "");
    formData.append("facebook", facebook || "");
    formData.append("youtube", youtube || "");
    formData.append("description", description || "");

    if (files.length > 0) {
      const compressedFiles = [];
      for (let i = 0; i < files.length; i++) {
        try {
          const compressed = await compressImage(files[i], 0.5, 1200, 1200);
          compressedFiles.push(compressed);
        } catch (e) {
          compressedFiles.push(files[i]);
        }
      }
      compressedFiles.forEach((file) => {
        formData.append("images", file);
      });
    }

    const method = id ? "PUT" : "POST";
    const url = id ? `/api/admin/properties/${id}` : "/api/admin/properties";

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (res.status === 401) {
      logout();
      return;
    }

    let data = {};
    try {
      data = await res.json();
    } catch (e) {}

    if (res.ok) {
      if (modalInstance) modalInstance.hide();
      loadProps();
      document.getElementById("f_images").value = "";
      alert("✅ تم الحفظ بنجاح!");
    } else {
      alert(`❌ فشل الحفظ: ${data.error || "حدث خطأ غير معروف"}`);
    }
  } catch (e) {
    alert("❌ تعذر الاتصال بالسيرفر. تأكد من تشغيل node server.js");
  } finally {
    saveBtn.innerHTML = originalText;
    saveBtn.disabled = false;
  }
};

fetch("/api/admin/me", {
  headers: { Authorization: `Bearer ${token}` },
})
  .then((res) => {
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) throw new Error("خطأ في السيرفر");
    return res.json();
  })
  .then((data) => {
    if (data) document.getElementById("adminName").textContent = data.name;
  })
  .catch(() => {
    document.getElementById("adminName").textContent = "⚠️ غير متصل بالسيرفر";
  });

async function loadProps() {
  try {
    const res = await fetch("/api/admin/properties", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) throw new Error("خطأ في جلب البيانات");
    allProps = await res.json();
    renderTable(allProps);
    updateStats(allProps);
  } catch (e) {
    console.error(e);
    document.getElementById("tableBody").innerHTML = `
            <tr><td colspan="7" class="text-danger text-center">⚠️ تعذر الاتصال بالسيرفر.</td></tr>`;
  }
}

function updateStats(list) {
  document.getElementById("totalProps").textContent = list.length;
  document.getElementById("availProps").textContent = list.filter(
    (p) => p.status === "available" || p.status === "unavailable",
  ).length;
  document.getElementById("featProps").textContent = list.filter(
    (p) => p.is_featured == 1,
  ).length;
}

function renderTable(list) {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  if (list.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center text-muted">لا توجد عقارات حالياً</td></tr>';
    return;
  }
  list.forEach((p) => {
    let cover =
      p.image_path || (p.images?.length > 0 ? p.images[0].image_path : "");
    if (!cover) cover = "/public/img/logo.jpeg";
    if (!cover.startsWith("/")) cover = "/" + cover;

    let statusLabel = "متاح";
    let badgeClass = "status-available";
    switch (p.status) {
      case "unavailable":
        statusLabel = "غير متاح";
        badgeClass = "status-unavailable";
        break;
      case "sold":
        statusLabel = "تم البيع";
        badgeClass = "status-sold";
        break;
      case "rented":
        statusLabel = "تم الايجار";
        badgeClass = "status-rented";
        break;
      default:
        statusLabel = "متاح";
        badgeClass = "status-available";
    }

    tbody.innerHTML += `
      <tr>
        <td><img src="${cover}" class="img-box" alt="${p.title}"></td>
        <td>${p.code || "-"}</td>
        <td><strong>${p.title}</strong></td>
        <td>${p.location || "-"}</td>
        <td>${new Intl.NumberFormat().format(p.price)} ج</td>
        <td><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn-icon btn-edit" onclick="editProp(${p.id})"><i class="bi bi-pencil"></i></button>
            <button class="btn-icon btn-delete" onclick="deleteProp(${p.id})"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  });
}

document.getElementById("searchInput").addEventListener("keyup", function () {
  const val = this.value.toLowerCase();
  const codeVal = document.getElementById("searchCode").value.toLowerCase();
  renderTable(
    allProps.filter(
      (p) =>
        p.title.toLowerCase().includes(val) ||
        (p.location && p.location.toLowerCase().includes(val)) ||
        (p.code && p.code.toLowerCase().includes(codeVal))
    )
  );
});

document.getElementById("searchCode").addEventListener("keyup", function () {
  const val = this.value.toLowerCase();
  const titleVal = document.getElementById("searchInput").value.toLowerCase();
  renderTable(
    allProps.filter(
      (p) =>
        p.title.toLowerCase().includes(titleVal) ||
        (p.location && p.location.toLowerCase().includes(titleVal)) ||
        (p.code && p.code.toLowerCase().includes(val))
    )
  );
});

loadProps();