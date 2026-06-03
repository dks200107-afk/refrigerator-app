// frontend/src/App.js

import React, {
  useState,
  useEffect,
  useRef
} from 'react';

import axios from 'axios';

import './App.css';

import {
  auth,
  provider,
  db
} from './firebase';

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc
} from 'firebase/firestore';

const API_BASE_URL =
  'https://refrigerator-app-jivi.onrender.com';

function App() {

  const [user, setUser] =
    useState(null);

  const [ingredients, setIngredients] =
    useState([]);

  const [name, setName] =
    useState('');

  const [category, setCategory] =
    useState('냉장');

  const [expiryDate, setExpiryDate] =
    useState('');

  const [quantity, setQuantity] =
    useState(1);

  const [unit, setUnit] =
    useState('개');

  const galleryInputRef =
    useRef(null);

  const [recipe, setRecipe] =
    useState('');

  const [additionalIngredients, setAdditionalIngredients] =
    useState('');

  const [shoppingList, setShoppingList] =
    useState([]);

  const [expiryNotified, setExpiryNotified] =
    useState(false);

  const checkExpiryIngredients = (
    items = ingredients
  ) => {

    const today = new Date();

    items.forEach(item => {

      const expiryDate =
        new Date(item.expiryDate);

      const diffTime =
        expiryDate - today;

      const diffDays =
        Math.ceil(
          diffTime /
          (1000 * 60 * 60 * 24)
        );

      if (
        diffDays >= 0 &&
        diffDays <= 3
      ) {

        alert(
          `${item.name} 유통기한이 ${diffDays}일 남았습니다.`
        );

      }

    });

  };

  // ======================
  // 로그인 유지
  // ======================

  useEffect(() => {

    const unsubscribe =
      onAuthStateChanged(
        auth,
        currentUser => {

          setUser(currentUser);

        }
      );

    return () => unsubscribe();

  }, []);

useEffect(() => {

  if ('Notification' in window) {

    if (
      Notification.permission !== 'granted'
    ) {

      Notification.requestPermission();

    }

  }

}, []);

  // ======================
  // 재료 조회
  // ======================

  const fetchIngredients =
    async (notify = false) => {

      if (!user) return;

      try {

        const querySnapshot =
          await getDocs(
            collection(
              db,
              'users',
              user.uid,
              'ingredients'
            )
          );

        const items = [];

        querySnapshot.forEach(docItem => {

          items.push({
            id: docItem.id,
            ...docItem.data(),
            editing: false
          });

        });

        setIngredients(items);

        if (notify && !expiryNotified) {
          checkExpiryIngredients(items);
          setExpiryNotified(true);
        }

      } catch (error) {

        console.error(error);

      }

    };

  useEffect(() => {

    if (user) {

      setExpiryNotified(false);
      fetchIngredients(true);

    }

// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

const handleGoogleLogin =
  async () => {

    try {

      provider.setCustomParameters({
        prompt: 'select_account'
      });

      await signInWithPopup(
        auth,
        provider
      );

    } catch (error) {

      console.error(error);

    }

  };

  // ======================
  // 로그아웃
  // ======================

  const handleLogout =
    async () => {

      await signOut(auth);

    };

  // ======================
  // 추가
  // ======================

  const handleSubmit =
    async (e) => {

      e.preventDefault();

      if (!name || !expiryDate) {

        alert('내용 입력');

        return;

      }

      try {

        await addDoc(
          collection(
            db,
            'users',
            user.uid,
            'ingredients'
          ),
          {
            name,
            category,
            expiryDate,
            quantity,
            unit
          }
        );

        setName('');
        setExpiryDate('');
        setQuantity(1);

        fetchIngredients();

      } catch (error) {

        console.error(error);

      }

    };

  // ======================
  // OCR
  // ======================

const handleOcrUpload =
  async (e) => {

    const file =
      e.target.files[0];

    if (!file) return;

    const formData =
      new FormData();

    formData.append(
      'receipt',
      file
    );

    alert('OCR 분석 시작');

    try {

      const res =
        await axios.post(
          `${API_BASE_URL}/api/ocr`,
          formData
        );

      const ocrIngredients =
        res.data.data;

      if (
        !ocrIngredients ||
        ocrIngredients.length === 0
      ) {

        alert(
          '식재료를 찾지 못했습니다.'
        );

        return;

      }

      for (
        const item
        of ocrIngredients
      ) {

        await addDoc(
          collection(
            db,
            'users',
            user.uid,
            'ingredients'
          ),
          {
            name:
              item.name,

            category:
              item.category || '냉장',

            expiryDate:
              item.expiryDate || '2026-12-31',

            quantity:
              item.quantity || 1,

            unit:
              item.unit || '개'
          }
        );

      }

      await fetchIngredients();

      alert(
        `${ocrIngredients.length}개 식재료 등록 완료`
      );

    } catch (error) {

      console.error(error);

      alert(
        'OCR 등록 실패'
      );

    }

  };

  // ======================
  // AI 레시피
  // ======================

  const getAiRecipe =
    async () => {

      setRecipe(
        'AI 레시피 생성 중...'
      );

      try {

        const sortedIngredients =
  [...ingredients]
    .sort((a, b) => {

      return (
        new Date(a.expiryDate)
        -
        new Date(b.expiryDate)
      );

    });

const today = new Date();

let ingredientNames =
  sortedIngredients
    .map(item => {

      const diffDays =
        Math.ceil(
          (
            new Date(item.expiryDate)
            - today
          )
          /
          (1000 * 60 * 60 * 24)
        );

      return `
${item.name}
(남은기간:${diffDays}일)
`;

    })
    .join(', ');

const extraText = additionalIngredients
  .trim();

if (extraText) {
  ingredientNames =
    ingredientNames
      ? `${ingredientNames}, ${extraText}`
      : extraText;
}

if (!ingredientNames) {
  setRecipe(
    '재료를 추가하거나 원하는 재료를 입력해주세요.'
  );
  return;
}

        const res =
          await axios.get(
            `${API_BASE_URL}/api/ai-recipe`,
            {
              params: {
                ingredients:
                  ingredientNames
              }
            }
          );

        setRecipe(
          res.data.recipe
        );

      } catch (error) {

        setRecipe('AI 오류');

      }

    };

  // ======================
  // 쇼핑리스트
  // ======================

  const getShoppingList =
    () => {

      const list = [];

      ingredients.forEach(item => {

        if (
          item.unit === '%' &&
          item.quantity <= 20
        ) {

          list.push(
            `${item.name} 거의 다 사용함`
          );

        }

        if (
          item.unit === '개' &&
          item.quantity <= 1
        ) {

          list.push(
            `${item.name} 재구매 추천`
          );

        }

      });

      if (list.length === 0) {

        list.push(
          '현재 구매 추천 품목 없음'
        );

      }

      setShoppingList(list);

    };

  // ======================
  // 로그인 안했을 때
  // ======================

  if (!user) {

    return (

      <div className="app-wrapper centered-screen">

        <h1>
          냉장고 관리 프로그램 🧊
        </h1>

        <button
          className="primary-button"
          onClick={
            handleGoogleLogin
          }
          type="button"
        >
          Google 로그인
        </button>

      </div>

    );

  }

  return (

    <div className="app-wrapper">

      <h1>
        냉장고 관리 프로그램 🧊
      </h1>

      {/* 로그인 */}

      <div className="user-panel">
        <div className="user-info">
          로그인: {user.email}
        </div>
        <button className="button-secondary" onClick={handleLogout}>
          로그아웃
        </button>
      </div>

      {/* OCR */}

      <section className="section-card">

        <h3>
          🧾 영수증 OCR 등록
        </h3>

        <div className="ocr-actions button-group">
          <button
            type="button"
            className="button-secondary"
            onClick={() => galleryInputRef.current?.click()}
          >
            영수증 등록
          </button>
        </div>

        <input
          ref={galleryInputRef}
          className="ocr-input-hidden"
          type="file"
          accept="image/*"
          onChange={handleOcrUpload}
        />

      </section>

      {/* 직접 입력 */}

      <section className="section-card">

        <h3>
          ✏️ 식재료 직접 입력
        </h3>

        <form
          onSubmit={
            handleSubmit
          }
          className="form-stack"
        >

          <input
            type="text"
            placeholder="식재료 이름"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
              )
            }
          />

          <select
            value={category}
            onChange={(e) =>
              setCategory(
                e.target.value
              )
            }
          >

            <option value="냉장">
              냉장
            </option>

            <option value="냉동">
              냉동
            </option>

            <option value="실온">
              실온
            </option>

          </select>

          <input
            type="number"
            placeholder="수량"
            value={quantity}
            onChange={(e) =>
              setQuantity(
                Number(
                  e.target.value
                )
              )
            }
          />

          <select
            value={unit}
            onChange={(e) =>
              setUnit(
                e.target.value
              )
            }
          >

            <option value="개">
              개
            </option>

            <option value="%">
              %
            </option>

          </select>

          <input
            type="date"
            value={expiryDate}
            onChange={(e) =>
              setExpiryDate(
                e.target.value
              )
            }
          />

          <button type="submit">
            등록
          </button>

        </form>

      </section>

      {/* 재고 현황 */}

      <section className="section-card">

        <h3>
          🛒 냉장고 재고 현황
        </h3>

        {['냉장', '냉동', '실온']
          .map(cat => (

          <div key={cat} className="category-block">

            <h4>
              {cat}
            </h4>

            {ingredients
              .filter(
                item =>
                  item.category === cat
              )
              .map(item => (

              <div
                key={item.id}
                className="item-card"
              >

                <div className="item-header">
                  <strong>
                    {item.name}
                  </strong>
                  <div className="item-actions button-group">

                  {/* 수정 */}

                  <button
                    className="button-secondary edit-button"
                    onClick={() => {

                      const updated =
                        ingredients.map(
                          ing => {

                            if (
                              ing.id === item.id
                            ) {

                              return {
                                ...ing,
                                editing:
                                  !ing.editing
                              };

                            }

                            return ing;

                          }
                        );

                      setIngredients(
                        updated
                      );

                    }}
                  >
                    수정
                  </button>

                  {/* 삭제 */}

                  {item.editing && (
                    <button
                      className="delete-button"
                      onClick={async () => {

                        if (
                          !window.confirm(
                            '삭제하시겠습니까?'
                          )
                        ) {

                          return;

                        }

                        await deleteDoc(
                          doc(
                            db,
                            'users',
                            user.uid,
                            'ingredients',
                            item.id
                          )
                        );

                        fetchIngredients();

                      }}
                    >
                      삭제
                    </button>
                  )}

                </div>

                <div className="item-meta">
                  <div>수량: {item.quantity}{item.unit}</div>
                  <div>유통기한: {item.expiryDate}</div>
                </div>

                {/* 수정 모달 */}

                {item.editing && (

<div className="edit-panel">

                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  name:
                                    e.target.value
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    />

                    <select
                      value={item.category}
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  category:
                                    e.target.value
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    >

                      <option value="냉장">
                        냉장
                      </option>

                      <option value="냉동">
                        냉동
                      </option>

                      <option value="실온">
                        실온
                      </option>

                    </select>

                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  quantity:
                                    Number(
                                      e.target.value
                                    )
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    />

                    <select
                      value={item.unit}
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  unit:
                                    e.target.value
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    >

                      <option value="개">
                        개
                      </option>

                      <option value="%">
                        %
                      </option>

                    </select>

                    <input
                      type="date"
                      value={
                        item.expiryDate
                      }
                      onChange={(e) => {

                        const updated =
                          ingredients.map(
                            ing => {

                              if (
                                ing.id === item.id
                              ) {

                                return {
                                  ...ing,
                                  expiryDate:
                                    e.target.value
                                };

                              }

                              return ing;

                            }
                          );

                        setIngredients(
                          updated
                        );

                      }}
                    />

                    <button
                      onClick={async () => {

                        await updateDoc(
                          doc(
                            db,
                            'users',
                            user.uid,
                            'ingredients',
                            item.id
                          ),
                          {
                            name: item.name,
                            category:
                              item.category,
                            quantity:
                              item.quantity,
                            unit: item.unit,
                            expiryDate:
                              item.expiryDate
                          }
                        );

                        fetchIngredients();

                      }}
                    >
                      저장
                    </button>

                  </div>

                )}

              </div>

            ))}

          </div>

        ))}

      </section>

      {/* AI 레시피 */}

      <section className="section-card ai-section">
        <div className="section-header">
          <h3>🤖 AI 레시피 추천</h3>
          <p className="section-description">현재 냉장고 재료와 추가 재료를 바탕으로 AI가 레시피를 추천해줍니다.</p>
        </div>

        <div className="form-stack">
          <label className="field-label">추가로 원하는 재료</label>
          <input
            type="text"
            placeholder="예: 감자, 양파, 버터"
            value={additionalIngredients}
            onChange={(e) => setAdditionalIngredients(e.target.value)}
          />
        </div>

        <div className="section-actions">
          <button className="primary-button" onClick={getAiRecipe}>
            AI 레시피 추천
          </button>
        </div>

        <pre className="recipe-output">{recipe}</pre>
      </section>

      {/* 쇼핑리스트 */}

      <section className="section-card shopping-section">
        <div className="section-header">
          <h3>🛍️ 쇼핑리스트</h3>
          <p className="section-description">남은 수량을 분석하여 구매가 필요한 재료를 알려줍니다.</p>
        </div>

        <div className="section-actions">
          <button className="primary-button" onClick={getShoppingList}>
            쇼핑리스트 보기
          </button>
        </div>

        <ul className="shopping-list">
          {shoppingList.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </section>

    </div>

  );

}

export default App;